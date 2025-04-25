import os
from celery import Celery
from django.conf import settings

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'songfer.settings')

app = Celery('Songfer')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()

# Configure celery beat to use the schedule from settings
app.conf.beat_schedule = settings.CELERY_BEAT_SCHEDULE
app.conf.timezone = settings.CELERY_TIMEZONE

@app.task(bind=True)
def debug_task(self):
    print(f'Request: {self.request!r}')

