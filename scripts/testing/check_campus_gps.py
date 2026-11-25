r"""
AttendSure - Live Teacher Campus GPS Monitor (3NF Schema)
Run: python testing\check_campus_gps.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from _bootstrap import setup_django

setup_django()

from django.utils import timezone
from apps.accounts.models import TeacherProfile
from apps.campus.models import TeacherLocationPing
from apps.campus.selectors import get_active_campus_coords


def main():
    c_lat, c_lon, radius, school_name = get_active_campus_coords()
    print("=" * 98)
    print(f"  ATTENDSURE LIVE CAMPUS GPS MONITOR - {school_name.upper()}")
    print(f"  Center: ({c_lat:.6f}, {c_lon:.6f}) | Allowed Radius: {radius}m")
    print("=" * 98)
    print(f"{'TEACHER NAME':<26} | {'EMP ID':<14} | {'DISTANCE':<10} | {'ZONE STATUS':<18} | {'LAST RECORDED'}")
    print("-" * 98)

    teachers = list(
        TeacherProfile.objects.select_related("user")
        .filter(user__is_active=True)
        .order_by("user__last_name", "user__first_name")
    )
    latest_by_teacher = {}
    for ping in (
        TeacherLocationPing.objects.select_related("boundary")
        .filter(teacher__in=teachers)
        .order_by("teacher_id", "-recorded_at")
    ):
        latest_by_teacher.setdefault(ping.teacher_id, ping)

    inside = outside = no_ping = 0
    for tc in teachers:
        ping = latest_by_teacher.get(tc.id)
        if ping:
            dist = ping.distance_meters
            is_in = ping.is_inside
            inside += int(is_in)
            outside += int(not is_in)
            dist_s = f"{dist:.1f}m" if dist < 1000 else f"{dist / 1000:.2f}km"
            state = ping.zone_status
            when = timezone.localtime(ping.recorded_at).strftime("%Y-%m-%d %I:%M %p")
        else:
            no_ping += 1
            dist_s, state, when = "--", "NO_CHECK_IN", "No GPS ping yet"
        print(f"{tc.full_name[:26]:<26} | {tc.employee_id[:14]:<14} | {dist_s:<10} | {state:<18} | {when}")

    print("-" * 98)
    print(f"Total Active Teachers: {len(teachers)} | Inside: {inside} | Outside: {outside} | No Ping: {no_ping}")
    print("=" * 98)


if __name__ == "__main__":
    main()
