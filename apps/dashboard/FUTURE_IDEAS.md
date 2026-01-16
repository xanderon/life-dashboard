# Future Ideas

## Spending Stats (Draft)

### 1) Monthly Spending Summary
**Display**
- Month + year
- Total spend (RON)
- Delta vs previous month (percent)

**UX rules**
- Green if spending decreased vs previous month
- Red if spending increased vs previous month
- Gray if first month (no baseline)

**Calculation**
- `total_current` = sum(receipts in current month)
- `total_prev` = sum(receipts in previous month)
- `% = (total_current - total_prev) / total_prev * 100`
- If `total_prev` missing -> first month

### 2) Monthly Progress Bar (Daily Cumulative)
**Concept**
- Progress by calendar days
- Each receipt contributes to its day
- Bar grows regardless of receipt count

**Display**
- Progress bar with percent
- "Day N of M"

**Calculation**
- Initial: compare to previous month
  - `progress = total_current / total_prev_month`
- Advanced (after min 3 months):
  - `baseline = avg(total_month[-1], total_month[-2], total_month[-3])`
  - `progress = total_current / baseline`

**Notes**
- Baseline is dynamic
- Extensible to median/rolling average

### 3) Item Classification (Food / Non-food / Junk)
**Principles**
- Classification per item
- Stored and reused
- Incremental enrichment

**Minimal item shape**
```json
{
  "name": "lapte",
  "price": 7.99,
  "category": "alimentar",
  "junk": false
}
```

**Allowed categories (initial)**
- alimentar
- nealimentar

**Extra flag**
- `junk: true | false`
- Independent of category (ex: alimentar + junk = snacks)

**Rules**
- Item classified once
- Future occurrences auto-inherit
- New items can stay unclassified initially

### 4) Monthly Aggregates
**Calculated values**
- total alimentar
- total nealimentar
- total junk
- percent of monthly total

**Example**
- Alimentar: 78%
- Nealimentar: 22%
- Junk: 14%

### 5) Food / Non-food Insights
**Conditions**
- Needs 1–2 months of history
- Compare vs personal average

**Examples**
- "Non-food +30% vs average"
- "Food below average — possibly more eating out"
- "Junk above personal average"

**Rules**
- Informative, not punitive
- Show only when delta is significant

### 6) Flexibility & Extensibility
- Categories can expand later
- Junk can become a score
- Progress baseline adjustable
- Insights toggleable and re-orderable
