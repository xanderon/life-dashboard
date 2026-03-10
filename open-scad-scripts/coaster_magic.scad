// Coaster with inlaid text so the top surface stays flush.
// Export base and inlay separately for two-color printing if needed.

mode = "both"; // "base", "text", or "both"

coaster_width = 95;
coaster_height = 75;
corner_radius = 10;
coaster_thickness = 1;
text_depth = 0.5;
text_string = "MAGIC";
text_size = 12;
text_font = "Cinzel Decorative:style=Bold";
$fn = 120;

inner_margin = 10;
corner_motif_radius = 2.4;

module rounded_rect_2d(w, h, r) {
  offset(r = r)
    square([w - 2 * r, h - 2 * r], center = true);
}

module star_2d(r1, r2, points) {
  polygon([
    for (i = [0 : points * 2 - 1])
      let(a = 360 / (points * 2) * i)
      [(i % 2 == 0 ? r1 : r2) * cos(a),
       (i % 2 == 0 ? r1 : r2) * sin(a)]
  ]);
}

module corner_motif_2d() {
  circle(r = corner_motif_radius);
}

module corner_motifs_2d() {
  for (sx = [-1, 1])
    for (sy = [-1, 1])
      translate([sx * (coaster_width / 2 - inner_margin),
                 sy * (coaster_height / 2 - inner_margin)])
        corner_motif_2d();
}

module inlay_2d() {
  union() {
    text(text_string, size = text_size, font = text_font,
         halign = "center", valign = "center", spacing = 1.0);
    corner_motifs_2d();
  }
}

module coaster_base() {
  difference() {
    linear_extrude(height = coaster_thickness)
      rounded_rect_2d(coaster_width, coaster_height, corner_radius);
    translate([0, 0, coaster_thickness - text_depth - 0.01])
      linear_extrude(height = text_depth + 0.02)
        inlay_2d();
  }
}

module coaster_text_inlay() {
  translate([0, 0, coaster_thickness - text_depth])
    linear_extrude(height = text_depth)
      inlay_2d();
}

if (mode == "base") {
  coaster_base();
} else if (mode == "text") {
  coaster_text_inlay();
} else {
  color("black") coaster_base();
  color("white") coaster_text_inlay();
}
