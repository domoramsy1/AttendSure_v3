# AttendSure Backend - Campus Scheduled Tasks
# File: D:\AttendSure_V3\backend\apps\campus\tasks.py

from celery import shared_task


@shared_task
def run_scheduled_loafing_audit():
    from apps.attendance.loafing_detector import detect_daily_student_loafing
    from apps.campus.services import detect_silent_on_duty_teachers

    student_res = detect_daily_student_loafing()
    signal_res = detect_silent_on_duty_teachers()
    created_signal_lost = signal_res.get("created_signal_lost_incidents", 0)
    return {
        **student_res,
        "created_signal_lost_incidents": created_signal_lost,
        "total_created": student_res.get("total_created", 0) + created_signal_lost,
    }