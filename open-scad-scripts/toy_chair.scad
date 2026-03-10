// Monobloc toy chair with a continuous curved seat/back and 3 cm base height.

chair_width = 50;
chair_depth = 60;
chair_height = 70;
seat_height = 28;
seat_depth = 34;
back_x = 52;
profile_radius = 6;
$fn = 90;

profile_points = [
  [0, 0],
  [0, seat_height],
  [seat_depth, seat_height],
  [back_x, chair_height],
  [back_x, 0]
];

profile_radii = [
  profile_radius,
  profile_radius,
  profile_radius - 1,
  profile_radius - 1,
  profile_radius
];

module chair_profile_2d() {
  intersection() {
    union() {
      for (i = [0 : len(profile_points) - 2])
        hull() {
          translate(profile_points[i])
            circle(r = profile_radii[i]);
          translate(profile_points[i + 1])
            circle(r = profile_radii[i + 1]);
        }
    }
    square([chair_depth, chair_height], center = false);
  }
}

linear_extrude(height = chair_width, center = true)
  chair_profile_2d();
