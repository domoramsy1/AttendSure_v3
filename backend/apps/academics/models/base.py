SUFFIX_CHOICES = [
    ('', 'None'),
    ('Jr.', 'Jr.'),
    ('Sr.', 'Sr.'),
    ('II', 'II'),
    ('III', 'III'),
    ('IV', 'IV'),
    ('V', 'V'),
]

SEX_CHOICES = [
    ('Male', 'Male'),
    ('Female', 'Female'),
]

SCAN_METHOD_CHOICES = [
    ('RFID', 'RFID Card Tap'),
    ('QR', 'QR Code Scan'),
    ('MANUAL', 'Manual Override (Security Guard)'),
]

DIRECTION_CHOICES = [
    ('IN', 'Entry'),
    ('OUT', 'Exit'),
]

ATTENDANCE_STATUS_CHOICES = [
    ('PRESENT', 'Present'),
    ('LATE', 'Late'),
    ('CUTTING', 'Cutting Classes'),
    ('ABSENT', 'Absent'),
    ('EXCUSED', 'Excused'),
]

ENROLLMENT_STATUS_CHOICES = [
    ('ENROLLED', 'Enrolled'),
    ('DROPPED', 'Dropped Out'),
    ('TRANSFERRED_IN', 'Transferred In'),
    ('TRANSFERRED_OUT', 'Transferred Out'),
]

ENROLLMENT_TYPE_CHOICES = [
    ('REGULAR', 'Regular'),
    ('LATE_ENROLLEE', 'Late Enrollee'),
    ('TRANSFERRED_IN', 'Transferred In'),
    ('RETURNING', 'Returning'),
    ('REPEATER', 'Repeater'),
]

USER_ROLE_CHOICES = [
    ('ADMIN', 'System Administrator'),
    ('PRINCIPAL', 'School Principal'),
    ('DEPT_HEAD', 'Department Head'),
    ('FACULTY', 'Faculty / Adviser'),
    ('GUARD', 'Security Guard'),
]

GATE_PASS_STATUS_CHOICES = [
    ('ACTIVE', 'Active / Usable'),
    ('USED', 'Used / Redeemed'),
    ('EXPIRED', 'Expired'),
    ('REVOKED', 'Revoked / Canceled'),
]

DAY_OF_WEEK_CHOICES = [
    (1, 'Monday'),
    (2, 'Tuesday'),
    (3, 'Wednesday'),
    (4, 'Thursday'),
    (5, 'Friday'),
    (6, 'Saturday'),
    (7, 'Sunday'),
]
