// Framed toy chair with connected legs and rounded seat/back.

seat_width = 52;
seat_depth = 44;
seat_thickness = 3;
corner_radius = 5;

leg_height = 30; // 3 cm
leg_radius = 3.2;
leg_inset = 5.5;

rail_height = 10;
rail_radius = 2.2;

back_height = 32;
back_thickness = 3;
back_radius = 5;
back_angle = 12;

$fn = 80;

module rounded_rect_2d(w, h, r) {
  offset(r = r)
    square([w - 2 * r, h - 2 * r], center = true);
}

module seat() {
  linear_extrude(height = seat_thickness)
    rounded_rect_2d(seat_width, seat_depth, corner_radius);
}

module backrest() {
  translate([0, (seat_depth / 2) + (back_thickness / 2), seat_thickness])
    rotate([back_angle, 0, 0])
      rotate([90, 0, 0])
        linear_extrude(height = back_thickness)
          rounded_rect_2d(seat_width, back_height, back_radius);
}

module leg() {
  cylinder(h = leg_height, r = leg_radius);
}

module legs() {
  for (sx = [-1, 1])
    for (sy = [-1, 1])
      translate([sx * (seat_width / 2 - leg_inset),
                 sy * (seat_depth / 2 - leg_inset),
                 -leg_height])
        leg();
}

module rails() {
  z = -leg_height + rail_height;
  for (sy = [-1, 1])
    translate([0, sy * (seat_depth / 2 - leg_inset), z])
      rotate([0, 90, 0])
        cylinder(h = seat_width - 2 * leg_inset, r = rail_radius, center = true);
  for (sx = [-1, 1])
    translate([sx * (seat_width / 2 - leg_inset), 0, z])
      rotate([90, 0, 0])
        cylinder(h = seat_depth - 2 * leg_inset, r = rail_radius, center = true);
}

union() {
  seat();
  backrest();
  legs();
  rails();
}
