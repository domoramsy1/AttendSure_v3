r"""
AttendSure - Live Teacher Campus GPS Monitor
Run: python testing\check_campus_gps.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from _bootstrap import setup_django

setup_django()

from django.utils import timezone
from common.gps import calculate_distance_meters
from apps.accounts.models import TeacherProfile
from apps.campus.models import TeacherLocationLog
from apps.campus.selectors import get_active_campus_coords


def main():
    c_lat, c_lon, radius, school_name = get_active_campus_coords()
    print("=" * 96)
    print(f"  ATTENDSURE LIVE CAMPUS GPS MONITOR - {school_name.upper()}")
    print(f"  Center: ({c_lat:.6f}, {c_lon:.6f}) | Allowed Radius: {radius}m")
    print("=" * 96)
    print(f"{'TEACHER NAME':<26} | {'EMP ID':<12} | {'DISTANCE':<10} | {'STATUS':<16} | {'LAST RECORDED'}")
    print("-" * 96)

    teachers = list(TeacherProfile.objects.filter(is_active=True).order_by("last_name", "first_name"))
    latest_by_teacher = {}
    for log in TeacherLocationLog.objects.filter(teacher__in=teachers).order_by("teacher_id", "-recorded_at"):
        latest_by_teacher.setdefault(log.teacher_id, log)

    inside = outside = no_ping = 0
    for tc in teachers:
        log = latest_by_teacher.get(tc.id)
        if log:
            dist = calculate_distance_meters(log.latitude, log.longitude, c_lat, c_lon)
            is_in = dist <= radius
            inside += int(is_in)
            outside += int(not is_in)
            dist_s = f"{dist:.1f}m" if dist < 1000 else f"{dist / 1000:.2f}km"
            state = "INSIDE_CAMPUS" if is_in else "OUTSIDE_CAMPUS"
            when = timezone.localtime(log.recorded_at).strftime("%Y-%m-%d %I:%M %p")
        else:
            no_ping += 1
            dist_s, state, when = "--", "NO_CHECK_IN", "No GPS log yet"
        print(f"{tc.full_name[:26]:<26} | {tc.employee_id[:12]:<12} | {dist_s:<10} | {state:<16} | {when}")

    print("-" * 96)
    print(f"Total Active Teachers: {len(teachers)} | Inside: {inside} | Outside: {outside} | No Log: {no_ping}")
    print("=" * 96)


if __name__ == "__main__":
    main()
