from celery import shared_task


@shared_task
def flush_location_queue():
    return "Location queue check completed."