from django.core.mail import send_mail
from django.conf import settings


def send_notification(subject: str, message: str, recipients: list[str]):
    if not recipients:
        return
    send_mail(
        subject=subject,
        message=message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=recipients,
        fail_silently=False,
    )