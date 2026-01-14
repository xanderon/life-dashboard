#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    import pillow_heif  # type: ignore
    pillow_heif.register_heif_opener()
except Exception:
    pass


SUPPORTED_EXTS = {".png", ".jpg", ".jpeg", ".heic", ".webp", ".tif", ".tiff"}

# ----------------------------
# Internal parse debug
# ----------------------------
_PARSE_DEBUG: bool = False
_PARSE_DEBUG_LINES: List[str] = []

def _pd(msg: str) -> None:
    if _PARSE_DEBUG:
        _PARSE_DEBUG_LINES.append(msg)


# ----------------------------
# Helpers
# ----------------------------

def _norm_spaces(s: str) -> str:
    s = s.replace("\u00a0", " ")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _strip_diacritics(s: str) -> str:
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def _upper_ascii(s: str) -> str:
    return _strip_diacritics(s).upper()


_MONEY_RE = re.compile(r"(\d{1,3}(?:[.\s]\d{3})*[.,]\s*\d{2})")


def parse_money(text: str) -> Optional[float]:
    m = _MONEY_RE.search(text)
    if not m:
        return None
    raw = m.group(1).replace(" ", "").replace(".", "").replace(",", ".")
    try:
        return float(raw)
    except ValueError:
        return None


def parse_quantity(text: str) -> Optional[float]:
    m = re.search(r"(\d+[.,]\d+)", text)
    if not m:
        return None
    raw = m.group(1).replace(",", ".")
    try:
        return float(raw)
    except ValueError:
        return None


def money_round(x: float) -> float:
    return round(float(x), 2)


# ----------------------------
# Apple Vision OCR
# ----------------------------

@dataclass
class OcrResult:
    text: str
    method: str


def _vision_available() -> bool:
    try:
        import Vision  # type: ignore
        import Quartz  # type: ignore
        return True
    except Exception:
        return False


def ocr_image_vision(image_path: Path) -> OcrResult:
    import Vision  # type: ignore
    import Quartz  # type: ignore

    nsurl = Quartz.CFURLCreateFromFileSystemRepresentation(
        None, str(image_path).encode("utf-8"), len(str(image_path)), False
    )
    img_src = Quartz.CGImageSourceCreateWithURL(nsurl, None)
    if img_src is None:
        raise RuntimeError(f"Could not open image: {image_path}")
    cg_img = Quartz.CGImageSourceCreateImageAtIndex(img_src, 0, None)
    if cg_img is None:
        raise RuntimeError(f"Could not decode image: {image_path}")

    req = Vision.VNRecognizeTextRequest.alloc().init()
    req.setRecognitionLevel_(Vision.VNRequestTextRecognitionLevelAccurate)
    try:
        req.setRecognitionLanguages_(["ro-RO", "en-US"])
    except Exception:
        pass
    req.setUsesLanguageCorrection_(True)

    handler = Vision.VNImageRequestHandler.alloc().initWithCGImage_options_(cg_img, None)
    ok = handler.performRequests_error_([req], None)[0]
    if not ok:
        raise RuntimeError("Vision OCR failed")

    obs = req.results() or []
    rows: List[Tuple[float, float, str]] = []
    for o in obs:
        try:
            txt = str(o.topCandidates_(1)[0].string())
        except Exception:
            continue
        bb = o.boundingBox()
        rows.append((float(bb.origin.y), float(bb.origin.x), _norm_spaces(txt)))

    rows.sort(key=lambda t: (-t[0], t[1]))
    lines = [t[2] for t in rows if t[2]]
    return OcrResult(text="\n".join(lines), method="apple_vision")


def ocr_image(image_path: Path) -> OcrResult:
    if not _vision_available():
        raise RuntimeError("Apple Vision not available. You need macOS + pyobjc Vision.")
    return ocr_image_vision(image_path)


# ----------------------------
# Parsing (receipt is source of truth)
# ----------------------------

_QTY_LINE_RE = re.compile(
    r"^\s*(\d+[.,]\d+)\s+(BUC|KG)\s*[xX×]\s*(\d+[.,]\s*\d{2})\s*$",
    re.IGNORECASE,
)


def is_returnare_garantie(line: str) -> bool:
    u = _upper_ascii(line)
    return ("RETURNARE" in u and "GARANT" in u)


def extract_merchant(lines: List[str]) -> Dict[str, Optional[str]]:
    name = None
    address = None
    city = None
    cif = None

    for idx, line in enumerate(lines[:50]):
        u = _upper_ascii(line)
        if name is None and "LIDL" in u:
            name = _norm_spaces(line)
        if cif is None and re.fullmatch(r"\d{8}", line.strip()):
            cif = line.strip()
        if address is None and (u.startswith("STRADA") or u.startswith("BULEVARDUL")):
            address = _norm_spaces(line)
            if idx + 1 < len(lines):
                city = _norm_spaces(lines[idx + 1])

    return {"name": name, "address": address, "city": city, "cif": cif}


def _clean_time_triplet(h: str, m: str, s: str) -> Tuple[str, str, str]:
    h = re.sub(r"\D", "0", h)
    m = re.sub(r"\D", "0", m)
    s = re.sub(r"\D", "0", s)
    return h, m, s


def extract_timestamp(lines: List[str]) -> Optional[str]:
    date_s = None
    time_s = None

    for line in lines:
        u = _upper_ascii(line)

        m = re.search(r"DATA\s*[: ]\s*([0-9]{2})/([0-9]{2})/([0-9]{4})", u)
        if m:
            date_s = f"{m.group(3)}-{m.group(2)}-{m.group(1)}"

        m = re.search(r"[0O]RA\s*[: ]\s*([0-9]{2})[-: ]([0-9]{2})[-: ]([0-9]{2})", u)
        if m:
            hh, mm, ss = _clean_time_triplet(m.group(1), m.group(2), m.group(3))
            time_s = f"{hh}:{mm}:{ss}"

    if date_s and time_s:
        return f"{date_s}T{time_s}"
    if date_s:
        return f"{date_s}T00:00:00"
    return None


def _find_lei_section(lines: List[str]) -> int:
    for i, ln in enumerate(lines):
        if _upper_ascii(ln) == "LEI":
            return i
    return -1


def _extract_amount_stream_from_lei(lines: List[str]) -> List[Tuple[float, str]]:
    start = _find_lei_section(lines)
    if start < 0:
        return []
    out: List[Tuple[float, str]] = []
    for ln in lines[start + 1 :]:
        u = _upper_ascii(ln)
        # Guard: OCR sometimes interleaves left-column qty lines into the LEI section.
        # We must NOT treat those as monetary tokens.
        if _QTY_LINE_RE.match(_norm_spaces(ln)):
            continue
        uu = _upper_ascii(_norm_spaces(ln))
        if ("BUC" in uu or "KG" in uu) and (" X " in f" {uu} " or "×" in uu or " X" in uu):
            continue
        if u.startswith(("TRANZAC", "CASA", "MG", "DATA", "TZ/POS", "ORA", "BON", "MULTUMESC", "ACHIZIT", "DETALII")):
            break
        if not _MONEY_RE.search(_norm_spaces(ln)):
            continue
        v = parse_money(ln)
        if v is None:
            continue
        raw_compact = ln.replace(" ", "")
        if "-" in raw_compact:
            v = -abs(v)
        out.append((money_round(v), ln))
    return out


# ----------------------------
# Discount/duplicate helpers (inserted)
# ----------------------------

def _vat_from_raw_token(raw: str) -> Optional[str]:
    ru = _upper_ascii(_norm_spaces(raw))
    m = re.search(r"\b([ABD])\b\s*$", ru)
    return m.group(1) if m else None


def attach_discounts_from_lei(
    items: List[Dict[str, Any]],
    lei_tokens: List[Tuple[float, str]],
) -> float:
    """Attach item-level discounts from the LEI section.

    LIDL prints discounts as negative amounts (often with VAT letter). These amounts
    usually appear *immediately after* the item's paid amount within the LEI stream.

    Rules:
      - We do NOT compute any values.
      - For each item with a paid_amount, find the next matching positive LEI token.
      - If the next LEI token is negative, treat it as a discount *unless* its VAT is D
        (VAT D is used for SGR/garantie returns).
      - Attach at most one discount per item.

    Returns the computed discount_total (sum of extracted discounts). This is computed
    from extracted discount tokens and is not claimed to be printed as a total on the receipt.
    """
    if not items or not lei_tokens:
        return 0.0

    # Reset any existing discounts to avoid mixing strategies.
    for it in items:
        it["discount"] = float(it.get("discount") or 0.0)
        it["discount_raw"] = it.get("discount_raw")

    # We walk the LEI token list once, in order.
    ti = 0
    discount_total = 0.0

    for it in items:
        paid = it.get("paid_amount")
        if paid is None:
            continue
        try:
            paid_v = money_round(float(paid))
        except Exception:
            continue

        # Advance until we find the next matching positive token.
        found = False
        while ti < len(lei_tokens):
            v, raw = lei_tokens[ti]
            if v > 0 and money_round(v) == paid_v:
                found = True
                break
            ti += 1

        if not found:
            continue

        # Candidate discount is the next token.
        if ti + 1 < len(lei_tokens):
            nv, nraw = lei_tokens[ti + 1]
            if nv < 0:
                vat = _vat_from_raw_token(nraw)
                if vat != "D":
                    disc = abs(float(nv))
                    it["discount"] = money_round(disc)
                    it["discount_raw"] = _norm_spaces(nraw)
                    discount_total += disc
                    ti = ti + 2
                    continue

        # No discount for this item; move past the paid token.
        ti += 1

    return money_round(discount_total)


def _needs_review_from_item(it: Dict[str, Any]) -> bool:
    # Mark items that are incomplete/missing paid_amount.
    return it.get("paid_amount") is None


def dedupe_incomplete_duplicates(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Remove obvious OCR-duplicate items.

    Safe heuristic (does not compute):
      - If two consecutive items have the same name+qty+unit+unit_price
      - and one is incomplete (paid_amount None) while the other has paid_amount
      - keep the complete one.

    This targets the observed duplicated 'Sirop cu stevie' style issues.
    """
    if not items:
        return items

    out: List[Dict[str, Any]] = []
    for it in items:
        if out:
            prev = out[-1]
            same_core = (
                _norm_spaces(str(prev.get("name") or "")) == _norm_spaces(str(it.get("name") or ""))
                and prev.get("unit") == it.get("unit")
                and prev.get("quantity") == it.get("quantity")
                and prev.get("unit_price") == it.get("unit_price")
            )
            if same_core:
                prev_incomplete = prev.get("paid_amount") is None
                cur_incomplete = it.get("paid_amount") is None
                if prev_incomplete and not cur_incomplete:
                    out[-1] = it
                    continue
                if cur_incomplete and not prev_incomplete:
                    continue
        out.append(it)

    return out


def extract_totals(lines: List[str]) -> Tuple[Optional[float], Optional[float], Optional[float]]:
    total = None
    subtotal = None
    total_tva = None

    lei = _extract_amount_stream_from_lei(lines)
    positives = [v for (v, _) in lei if v > 0]
    if positives:
        total = positives[-1]
    if len(positives) >= 2:
        subtotal = positives[-2]

    for i, ln in enumerate(lines):
        if _upper_ascii(ln).startswith("TOTAL TVA"):
            for j in range(i + 1, min(len(lines), i + 40)):
                v = parse_money(lines[j])
                if v is not None:
                    total_tva = money_round(v)
                    break
            break

    return total, subtotal, total_tva


def parse_items(lines: List[str]) -> Tuple[List[Dict[str, Any]], List[str], float]:
    """Parse receipt items using an item-centric state machine.

    Supports non-stable OCR ordering seen on LIDL receipts:
      - Pattern A: q_line -> name -> paid
      - Pattern B: q_line -> paid -> name
      - Pattern C: q_line -> (vat-only noise) -> name -> paid
      - Pattern D: item + paid followed by REDUCERE/DISCOUNT block with negative amount

    The receipt is the source of truth: we extract, we do not recompute.
    """

    items: List[Dict[str, Any]] = []
    warnings: List[str] = []

    def u(s: str) -> str:
        return _upper_ascii(_norm_spaces(s))

    def is_totals_marker(s: str) -> bool:
        return u(s).startswith(("SUBTOTAL", "TOTAL", "TOTAL TVA"))

    def is_discount_marker(s: str) -> bool:
        return u(s).startswith("DISCOUNT")

    def is_discount_prelude(s: str) -> bool:
        uu = u(s)
        return uu.startswith("REDUCERE") or ("REDUCERE" in uu and "LIDL" in uu and "PLUS" in uu)

    def is_footer_noise(s: str) -> bool:
        uu = u(s)
        if not uu:
            return True
        if uu in {"CARD", "LEI", "A", "B", "D"}:
            return True
        if uu.startswith(
            (
                "TVA",
                "TRANZAC",
                "CASA",
                "MG",
                "DATA",
                "TZ/POS",
                "ORA",
                "BON",
                "MULTUMESC",
                "MULȚUMESC",
                "ACHIZIT",
                "DETALII",
            )
        ):
            return True
        return False

    def _line_is_vat_only(s: str) -> Optional[str]:
        ss = _norm_spaces(s)
        if ss in {"A", "B", "D"}:
            return ss
        uu = u(ss)
        if uu in {"A", "B", "D"} and len(uu) == 1:
            return uu
        return None

    def _parse_money_vat_inline(s: str) -> Optional[Tuple[float, str, str]]:
        """Return (value, vat_code, name_part) if line contains money + VAT letter.

        name_part is the remaining text with the money+vat removed (can be empty).
        """
        ss = _norm_spaces(s)
        mm = parse_money(ss)
        if mm is None:
            return None
        # VAT letter at end (possibly separated)
        su = u(ss)
        mvat = re.search(r"\b([ABD])\b\s*$", su)
        if not mvat:
            return None
        vat = mvat.group(1)

        val = mm
        if "-" in ss.replace(" ", ""):
            val = -abs(val)
        val = money_round(val)

        # Remove the last money occurrence and trailing VAT to get a potential name part.
        # Keep this conservative to avoid deleting product names that contain numbers.
        name_part = ss
        name_part = _MONEY_RE.sub("", name_part, count=1).strip()
        name_part = re.sub(r"\b[ABD]\b\s*$", "", name_part, flags=re.IGNORECASE).strip()
        return val, vat, name_part

    def _parse_money_then_vat(lines_: List[str], idx: int) -> Optional[Tuple[float, str, int]]:
        """Parse split tokens across two lines.

        Supports both:
          - amount then VAT-only (e.g. `12,19` + `B`)
          - VAT-only then amount (e.g. `B` + `12,19`)

        Returns (value, vat, consumed_lines).
        """
        if idx >= len(lines_):
            return None
        if idx + 1 >= len(lines_):
            return None

        a = _norm_spaces(lines_[idx])
        b = _norm_spaces(lines_[idx + 1])

        # Case 1: amount then VAT
        mm_a = parse_money(a)
        vat_b = _line_is_vat_only(b)
        if mm_a is not None and vat_b:
            val = mm_a
            if "-" in a.replace(" ", ""):
                val = -abs(val)
            return money_round(val), vat_b, 2

        # Case 2: VAT then amount
        vat_a = _line_is_vat_only(a)
        mm_b = parse_money(b)
        if vat_a and mm_b is not None:
            val = mm_b
            if "-" in b.replace(" ", ""):
                val = -abs(val)
            return money_round(val), vat_a, 2

        return None

    def _parse_money_only(s: str) -> Optional[float]:
        """Parse a money value from a line that may contain only the amount (no VAT).

        We accept small OCR noise around the number (e.g. trailing ')'), but the line must not
        contain letters.
        """
        ss = _norm_spaces(s)
        mm = parse_money(ss)
        if mm is None:
            return None

        uu = _upper_ascii(ss)
        # Must not contain letters (VAT letters handled elsewhere).
        if re.search(r"[A-ZĂÂÎȘŞȚŢ]", uu):
            return None

        # Remove common leading/trailing noise characters and re-check the shape.
        uu2 = re.sub(r"^[^0-9\-]+", "", uu)
        uu2 = re.sub(r"[^0-9.,\-\s]+$", "", uu2)
        uu2 = uu2.strip()

        if not re.fullmatch(r"-?\d{1,3}(?:[.\s]\d{3})*[.,]\s*\d{2}", uu2):
            return None

        val = mm
        if "-" in ss.replace(" ", ""):
            val = -abs(val)
        return money_round(val)

    def _looks_like_money_noise(s: str) -> bool:
        # Lines like "7,99 B" are handled by _parse_money_vat_inline; this is for pure numeric leftovers.
        ss = _norm_spaces(s)
        if parse_money(ss) is None:
            return False
        # If the line is basically just a number (possibly with separators), treat as not-a-name.
        uu = u(ss)
        return bool(re.fullmatch(r"[0-9.,\-\s]+", uu))

    sgr_recovered = 0.0

    pending_vat: Optional[str] = None

    i = 0
    while i < len(lines):
        ln = _norm_spaces(lines[i])
        if is_totals_marker(ln):
            break

        m = _QTY_LINE_RE.match(ln)
        if not m:
            i += 1
            continue

        qty_raw = m.group(1)
        unit = m.group(2).upper()
        unit_price_raw = m.group(3)

        qty = parse_quantity(qty_raw)
        unit_price = parse_money(unit_price_raw)

        # Start a new current item.
        cur_name: Optional[str] = None
        cur_paid: Optional[float] = None
        cur_paid_raw: Optional[str] = None
        cur_vat: Optional[str] = None
        cur_discount: float = 0.0
        cur_discount_raw: Optional[str] = None

        # Prevent VAT-only lines from leaking across item boundaries.
        pending_vat = None

        # Move to the next line after qty line and collect until we can close the item.
        j = i + 1
        skipped = 0
        while j < len(lines):
            cand = _norm_spaces(lines[j])

            if is_totals_marker(cand) or _QTY_LINE_RE.match(cand):
                # If we already have both, we can stop collecting for this item.
                if cur_name is not None and cur_paid is not None:
                    break
                break

            if is_footer_noise(cand):
                j += 1
                skipped += 1
                continue

            # Ignore prelude lines; DISCOUNT itself is handled after closing the item.
            if is_discount_prelude(cand) or is_discount_marker(cand):
                j += 1
                skipped += 1
                continue

            # Handle VAT-only lines: set pending_vat and skip
            vat_only = _line_is_vat_only(cand)
            if vat_only is not None:
                pending_vat = vat_only
                _pd(f"[vat] pending_vat={pending_vat} line='{cand}'")
                j += 1
                skipped += 1
                continue

            # Handle returnare garantie: do not create an item; skip forward to next qty/totals.
            if cur_name is None and is_returnare_garantie(cand):
                _pd(f"[skip] returnare_garantie after q_line='{ln}'")
                # Advance to the next qty line / totals marker
                j += 1
                while j < len(lines) and (not _QTY_LINE_RE.match(_norm_spaces(lines[j]))) and (not is_totals_marker(_norm_spaces(lines[j]))):
                    j += 1
                cur_name = None
                cur_paid = None
                break

            # 1) Paid amount can be inline (e.g., "7,99 B")
            mv = _parse_money_vat_inline(cand)
            if mv is not None:
                val, vat, name_part = mv
                # Only accept positive values as paid for the current item
                if val > 0 and cur_paid is None:
                    cur_paid = val
                    cur_vat = vat
                    cur_paid_raw = cand
                    if cur_name is None and name_part and not _looks_like_money_noise(name_part):
                        cur_name = name_part
                    _pd(f"[paid] inline val={cur_paid} vat={cur_vat} line='{cand}'")
                    j += 1
                    # don't close yet; name might come after (Pattern B)
                    continue
                # Negative values are discounts/SGR handled later (only after close)

            # 2) Paid amount can be split across two lines: "12,19" then "B"
            mv2 = _parse_money_then_vat(lines, j)
            if mv2 is not None:
                val, vat, consumed = mv2
                if val > 0 and cur_paid is None:
                    cur_paid = val
                    cur_vat = vat
                    cur_paid_raw = _norm_spaces(lines[j]) + " " + _norm_spaces(lines[j + 1])
                    _pd(f"[paid] split val={cur_paid} vat={cur_vat} line='{cur_paid_raw}'")
                    j += consumed
                    continue

            # 3) Paid amount as numeric-only, possibly with pending VAT
            mv3 = _parse_money_only(cand)
            if mv3 is not None and cur_paid is None:
                # paid amount without VAT letter; use pending_vat if we saw it, otherwise keep None
                if mv3 > 0:
                    cur_paid = mv3
                    cur_vat = pending_vat
                    cur_paid_raw = cand if pending_vat is None else f"{cand} {pending_vat}"
                    _pd(f"[paid] money_only val={cur_paid} vat={cur_vat} line='{cur_paid_raw}'")
                    pending_vat = None
                    j += 1
                    continue
                # negative money-only lines are discounts/SGR handled outside the item-close path

            # 4) Otherwise, treat as name candidate (but never accept obvious money noise)
            if cur_name is None and not _looks_like_money_noise(cand) and not _line_is_vat_only(cand):
                cur_name = cand
                _pd(f"[name] '{cur_name}'")
                j += 1
                continue

            # If we get here, it was neither a name nor a paid marker we can use.
            j += 1
            skipped += 1

        # At this point, we may have a complete item.
        if cur_name is None or cur_paid is None:
            # If this was a returnare_garantie skip, just advance.
            if cur_name is None and cur_paid is None and j > i + 1 and (j < len(lines)) and (_QTY_LINE_RE.match(_norm_spaces(lines[j])) or is_totals_marker(_norm_spaces(lines[j]))):
                i = j
                continue
            warnings.append(
                f"Incomplete item after qty line '{ln}' (name={cur_name!r}, paid={cur_paid!r})"
            )
            _pd(f"[warn] incomplete item q_line='{ln}' name={cur_name!r} paid={cur_paid!r} pending_vat={pending_vat!r}")
            ctx = []
            for t in range(i + 1, min(len(lines), i + 6)):
                ctx.append(_norm_spaces(lines[t]))
            _pd(f"[warn_ctx] after '{ln}' -> {ctx}")
            i = i + 1
            continue

        # If the close condition wasn't reached inside the loop, ensure it's true now.
        # (Pattern B can set paid before name; loop keeps going until it finds name or stops.)
        if cur_name is None or cur_paid is None:
            warnings.append(
                f"Incomplete item after qty line '{ln}' (name={cur_name!r}, paid={cur_paid!r})"
            )
            i = i + 1
            continue

        # ---- optional discount block right after the item (Pattern D) ----
        k = j
        # We may see sequences like:
        #   REDUCERE 25%
        #   DISCOUNT
        #   1,53-B
        # or sometimes:
        #   DISCOUNT
        #   1,53-B
        # or OCR drops the keyword and we only get:
        #   1,53-B
        # We attach at most ONE discount to the just-closed item.

        # skip any number of REDUCERE / Lidl Plus lines
        while k < len(lines) and is_discount_prelude(_norm_spaces(lines[k])):
            k += 1

        # optional DISCOUNT marker
        if k < len(lines) and is_discount_marker(_norm_spaces(lines[k])):
            k += 1

        if k < len(lines):
            nxt = _norm_spaces(lines[k])

            def _take_negative_amount(k_idx: int) -> Optional[Tuple[float, str, int, Optional[str]]]:
                """Return (abs_value, raw_text, consumed_lines, vat_code_if_known) for a negative amount."""
                line0 = _norm_spaces(lines[k_idx])

                # inline negative with VAT
                ni = _parse_money_vat_inline(line0)
                if ni is not None and ni[0] < 0:
                    return abs(ni[0]), line0, 1, ni[1]

                # money-only negative
                mo = _parse_money_only(line0)
                if mo is not None and mo < 0:
                    return abs(mo), line0, 1, None

                # split across two lines (either order)
                ns = _parse_money_then_vat(lines, k_idx)
                if ns is not None and ns[0] < 0:
                    raw = _norm_spaces(lines[k_idx]) + " " + _norm_spaces(lines[k_idx + 1])
                    return abs(ns[0]), raw, ns[2], ns[1]

                return None

            taken = _take_negative_amount(k)
            if taken is not None:
                disc_val, disc_raw, consumed, disc_vat = taken
                # VAT=D indicates SGR refund, not an item discount.
                if disc_vat == "D":
                    cur_discount = 0.0
                    cur_discount_raw = None
                else:
                    cur_discount = float(disc_val)
                    cur_discount_raw = disc_raw
                k += consumed

        items.append(
            {
                "name": cur_name,
                "quantity": qty,
                "quantity_raw": qty_raw,
                "unit": unit,
                "unit_price": unit_price,
                "unit_price_raw": unit_price_raw,
                "paid_amount": cur_paid,
                "paid_amount_raw": cur_paid_raw,
                "discount": cur_discount,
                "discount_raw": cur_discount_raw,
            }
        )

        _pd(
            f"[item] q_line='{ln}' name='{cur_name}' paid={cur_paid} vat={cur_vat} discount={cur_discount}"
        )

        # Advance: continue scanning from where we ended (k if we consumed discount, else j)
        i = max(i + 1, k)

    # ---- SGR recovered (negative D) ----
    # Prefer LEI stream tokens because that's where the refund is consistently printed.
    try:
        lei_tokens = _extract_amount_stream_from_lei(lines)
    except Exception:
        lei_tokens = []

    # First pass: find a negative value whose raw line ends with VAT=D (inline)
    for v, raw in lei_tokens:
        ru = _upper_ascii(_norm_spaces(raw))
        if v < 0 and re.search(r"\bD\b\s*$", ru):
            sgr_recovered = abs(v)
            break

    # Fallback: scan full lines for split tokens like:
    #   -8,50
    #   D
    if sgr_recovered == 0.0:
        for idx in range(len(lines) - 1):
            a = _norm_spaces(lines[idx])
            b = _norm_spaces(lines[idx + 1])
            if b != "D":
                continue
            vv = parse_money(a)
            if vv is None:
                continue
            if "-" in a.replace(" ", ""):
                vv = -abs(vv)
            vv = money_round(vv)
            if vv < 0:
                sgr_recovered = abs(vv)
                break

    return items, warnings, money_round(sgr_recovered)
# ----------------------------
# JSON builder
# ----------------------------

def build_json_schema_v3(
    *,
    store: str,
    rel_base: str,
    file_name: str,
    ocr_text: str,
    merchant: Dict[str, Optional[str]],
    timestamp: Optional[str],
    total: Optional[float],
    discount_total: float,
    sgr_charge: float,
    sgr_recovered: float,
    items: List[Dict[str, Any]],
    warnings: List[str],
    status: str,
    error: Optional[str],
) -> Dict[str, Any]:
    return {
        "schema_version": 3,
        "store": store,
        "timestamp": timestamp,
        "currency": "RON",
        "total": total,
        "discount_total": money_round(discount_total),
        "sgr_bottle_charge": money_round(sgr_charge),
        "sgr_recovered_amount": money_round(sgr_recovered),
        "merchant": {
            "name": merchant.get("name"),
            "address": merchant.get("address"),
            "city": merchant.get("city"),
            "cif": merchant.get("cif"),
        },
        "items": items,
        "processing": {
            "status": status,
            "warnings": warnings,
            "error": error,
            "ocr_engine": "apple_vision",
        },
        "source": {
            "file_name": file_name,
            "store_folder": store,
            "rel_path": f"{rel_base}/{store}/{file_name}",
        },
        "raw_text": ocr_text,
    }


# ----------------------------
# Runner / CLI
# ----------------------------

def iter_images(input_dir: Path) -> List[Path]:
    return [p for p in sorted(input_dir.iterdir()) if p.is_file() and p.suffix.lower() in SUPPORTED_EXTS]


def ensure_dir(p: Path) -> None:
    p.mkdir(parents=True, exist_ok=True)


def write_debug(logs_dir: Path, stem: str, content: str) -> None:
    ensure_dir(logs_dir)
    (logs_dir / f"{stem}.debug.txt").write_text(content, encoding="utf-8")


def process_one(image_path: Path, store: str, rel_base: str, debug: bool) -> Tuple[Dict[str, Any], str]:
    dbg: List[str] = []
    dbg.append(f"[FILE] {image_path.name}")

    global _PARSE_DEBUG, _PARSE_DEBUG_LINES
    _PARSE_DEBUG = bool(debug)
    _PARSE_DEBUG_LINES = []

    ocr = ocr_image(image_path)
    dbg.append(f"[OCR] method={ocr.method} chars={len(ocr.text)}")

    lines = [_norm_spaces(x) for x in ocr.text.splitlines() if _norm_spaces(x)]

    merchant = extract_merchant(lines)
    timestamp = extract_timestamp(lines)
    total, subtotal, total_tva = extract_totals(lines)

    items, warnings, sgr_recovered = parse_items(lines)

    # Post-processing: attach discounts from LEI token stream (pure extraction).
    # This avoids global shifting and matches discounts that appear as negative LEI tokens.
    try:
        lei_tokens = _extract_amount_stream_from_lei(lines)
    except Exception:
        lei_tokens = []

    discount_total = attach_discounts_from_lei(items, lei_tokens)

    # Mark items that still need human review (e.g., OCR missed paid_amount).
    for it in items:
        it["needs_review"] = _needs_review_from_item(it)

    # Safe dedupe for obvious OCR duplicates.
    items = dedupe_incomplete_duplicates(items)

    if debug and _PARSE_DEBUG_LINES:
        dbg.append("[PARSE_DEBUG]")
        dbg.extend(_PARSE_DEBUG_LINES)

    sgr_charge = 0.0

    status = "ok"
    err = None
    if total is None:
        status = "fail"
        err = "Could not extract TOTAL (missing LEI stream or parse failure)"
    elif warnings:
        status = "warn"

    dbg.append(f"[DT] timestamp={timestamp}")
    dbg.append(f"[TOTALS] total={total} subtotal={subtotal} total_tva={total_tva} discount_total={discount_total:.2f}")
    dbg.append(f"[SGR] recovered={sgr_recovered:.2f}")
    dbg.append(f"[ITEMS] count={len(items)}")

    if debug:
        for idx, it in enumerate(items):
            dbg.append(
                f"  item[{idx}] q={it.get('quantity')} {it.get('unit')} unit_price={it.get('unit_price')} "
                f"paid={it.get('paid_amount')} disc={it.get('discount')} needs_review={it.get('needs_review')} name='{it.get('name')}'"
            )

    out_json = build_json_schema_v3(
        store=store,
        rel_base=rel_base,
        file_name=image_path.name,
        ocr_text="\n".join(lines),
        merchant=merchant,
        timestamp=timestamp,
        total=total,
        discount_total=discount_total,
        sgr_charge=sgr_charge,
        sgr_recovered=sgr_recovered,
        items=items,
        warnings=warnings,
        status=status,
        error=err,
    )

    return out_json, "\n".join(dbg) + "\n"


def parse_file(image_path: Path, store: str = "lidl", rel_base: str = "inbox", debug: bool = False) -> Dict[str, Any]:
    out_json, _dbg = process_one(Path(image_path), store=store, rel_base=rel_base, debug=debug)
    return out_json


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="Parse LIDL receipts images -> JSON (schema v3) using Apple Vision OCR.")
    ap.add_argument("input_folder", help="Folder containing receipt images (.png/.jpg/.jpeg/.heic/...)")
    ap.add_argument("--out", required=True, help="Output folder for JSON files")
    ap.add_argument("--store", default="lidl", help="Store slug (default: lidl)")
    ap.add_argument("--rel-base", default="inbox", help="rel_base to build source.rel_path (default: inbox)")
    ap.add_argument("--logs-dir", default=None, help="If set, write per-file debug logs here")
    ap.add_argument("--debug", action="store_true", help="Verbose debug logs")

    args = ap.parse_args(argv)

    input_dir = Path(os.path.expanduser(args.input_folder)).resolve()
    out_dir = Path(os.path.expanduser(args.out)).resolve()
    logs_dir = Path(os.path.expanduser(args.logs_dir)).resolve() if args.logs_dir else None

    if not input_dir.exists() or not input_dir.is_dir():
        print(f"[ERROR] input_folder not found or not a folder: {input_dir}", file=sys.stderr)
        return 2

    ensure_dir(out_dir)
    if logs_dir:
        ensure_dir(logs_dir)

    images = iter_images(input_dir)
    if not images:
        print(f"[WARN] No images found in {input_dir} (supported: {sorted(SUPPORTED_EXTS)})")
        return 0

    for img_path in images:
        out_json, dbg = process_one(img_path, store=args.store, rel_base=args.rel_base, debug=args.debug)

        stem = img_path.stem
        (out_dir / f"{stem}.json").write_text(json.dumps(out_json, indent=2, ensure_ascii=False), encoding="utf-8")

        if logs_dir:
            write_debug(logs_dir, stem, dbg)

        status = out_json.get("processing", {}).get("status")
        total = out_json.get("total")
        discount_total = out_json.get("discount_total")
        sgr_rec = out_json.get("sgr_recovered_amount")
        items_n = len(out_json.get("items", []))
        print(f"[{str(status).upper()}] File {img_path.name} | total={total} | discount_total={discount_total} | sgr_recovered={sgr_rec} | items={items_n}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
