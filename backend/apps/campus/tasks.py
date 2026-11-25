from celery import shared_task


@shared_task
def run_scheduled_loafing_audit():
    from apps.attendance.loafing_detector import detect_daily_student_loafing

    return detect_daily_student_loafing()
