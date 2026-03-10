// Print-in-place hinged box (5 cm cube) with simple hinge.
// Export as STL directly; lid and base are already assembled with clearance.

outer = 50;
wall = 2;
lid_thickness = 2;
clearance = 0.4;
skirt_depth = 6;

pin_radius = 2.2;
barrel_radius = 3.6;
hinge_overlap = 0.6;
hinge_end_gap = 6;

$fn = 80;

base_height = outer - lid_thickness;
lid_z = base_height + clearance;
hinge_axis_y = outer + barrel_radius - hinge_overlap;
hinge_axis_z = lid_z + lid_thickness / 2;
hinge_length = outer - 2 * hinge_end_gap;

module base_shell() {
  difference() {
    cube([outer, outer, base_height], center = false);
    translate([wall, wall, wall])
      cube([outer - 2 * wall, outer - 2 * wall, base_height - wall], center = false);
  }
}

module hinge_pin() {
  translate([hinge_end_gap, hinge_axis_y, hinge_axis_z])
    rotate([0, 90, 0])
      cylinder(h = hinge_length, r = pin_radius, center = false);
}

module hinge_bracket(x_pos) {
  hull() {
    translate([x_pos, outer - 0.5, hinge_axis_z - 2])
      cube([3, 1, 4], center = false);
    translate([x_pos + 1.5, hinge_axis_y, hinge_axis_z])
      rotate([0, 90, 0])
        cylinder(h = 1, r = pin_radius + 0.6, center = true);
  }
}

module base() {
  union() {
    base_shell();
    hinge_pin();
    hinge_bracket(hinge_end_gap - 1);
    hinge_bracket(hinge_end_gap + hinge_length - 2);
  }
}

module lid_barrel() {
  translate([hinge_end_gap, hinge_axis_y, hinge_axis_z])
    rotate([0, 90, 0])
      difference() {
        cylinder(h = hinge_length, r = barrel_radius, center = false);
        translate([0, 0, -0.1])
          cylinder(h = hinge_length + 0.2, r = pin_radius + clearance, center = false);
      }
}

module lid() {
  union() {
    translate([0, 0, lid_z])
      cube([outer, outer, lid_thickness], center = false);
    translate([wall + clearance, wall + clearance, lid_z - skirt_depth])
      cube([outer - 2 * (wall + clearance),
            outer - 2 * (wall + clearance),
            skirt_depth], center = false);
    lid_barrel();
  }
}

union() {
  base();
  lid();
}
