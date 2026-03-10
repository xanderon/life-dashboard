// 10x10 cm plate with rounded corners, 1 mm base and 1 mm top features.
// Top features: 1 mm frame and a bass clef ("cheia fa") in the center.

plate_size = 100;
corner_radius = 6;
base_thickness = 1;
top_thickness = 1;
frame_width = 1;

clef_scale = 2.2;
clef_stroke = 3.0;
clef_dots_r = 1.3;

$fn = 80;

module rounded_square_2d(size, r) {
  offset(r = r)
    square([size - 2 * r, size - 2 * r], center = true);
}

module frame_2d(size, r, w) {
  inner_size = size - 2 * w;
  inner_r = max(r - w, 0.1);
  difference() {
    rounded_square_2d(size, r);
    rounded_square_2d(inner_size, inner_r);
  }
}

module stroke_polyline(points, r) {
  for (i = [0 : len(points) - 2])
    hull() {
      translate(points[i])
        circle(r = r);
      translate(points[i + 1])
        circle(r = r);
    }
}

module bass_clef_2d() {
  base_points = [
    [-8, 18],
    [-14, 10],
    [-10, 0],
    [0, -6],
    [12, -2],
    [10, 10],
    [2, 16],
    [-6, 12],
    [-4, 2],
    [4, 0],
    [10, 4],
    [12, 12]
  ];
  scale([clef_scale, clef_scale])
    union() {
      stroke_polyline(base_points, clef_stroke / 2);
      translate([14, 6]) circle(r = clef_dots_r);
      translate([14, -2]) circle(r = clef_dots_r);
    }
}

module base_layer() {
  linear_extrude(height = base_thickness)
    rounded_square_2d(plate_size, corner_radius);
}

module top_features() {
  translate([0, 0, base_thickness])
    linear_extrude(height = top_thickness)
      union() {
        frame_2d(plate_size, corner_radius, frame_width);
        bass_clef_2d();
      }
}

union() {
  base_layer();
  top_features();
}
