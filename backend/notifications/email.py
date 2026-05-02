from concurrent.futures import ThreadPoolExecutor
import logging

from django.core.mail import send_mail
from django.conf import settings
from django.db import transaction


_EXECUTOR = ThreadPoolExecutor(
    max_workers=getattr(settings, "EMAIL_NOTIFICATION_MAX_WORKERS", 2),
    thread_name_prefix="equaltrip-email",
)


def _normalize_recipients(recipients: list[str]) -> list[str]:
    normalized = []
    seen = set()
    for recipient in recipients:
        email = (recipient or "").strip()
        if not email or email in seen:
            continue
        seen.add(email)
        normalized.append(email)
    return normalized


def _send_notification_sync(subject: str, message: str, recipients: list[str]):
    send_mail(
        subject=subject,
        message=message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=recipients,
        fail_silently=False,
    )


def _log_async_failure(future):
    exc = future.exception()
    if exc is None:
        return
    logging.error(
        "Async notification email send failed",
        exc_info=(type(exc), exc, exc.__traceback__),
    )


def _submit_notification(subject: str, message: str, recipients: list[str]):
    future = _EXECUTOR.submit(_send_notification_sync, subject, message, recipients)
    future.add_done_callback(_log_async_failure)


def send_notification(subject: str, message: str, recipients: list[str]):
    normalized = _normalize_recipients(recipients)
    if not normalized:
        return

    if getattr(settings, "EMAIL_NOTIFICATIONS_ASYNC", False):
        transaction.on_commit(lambda: _submit_notification(subject, message, normalized))
        return

    _send_notification_sync(subject, message, normalized)
