from datetime import date, datetime
import logging

from django.conf import settings
from django.utils import timezone

from trips.models import Trip, TripMember

from .email import send_notification


def trip_member_emails(trip: Trip, exclude_user_ids: list[int] | None = None) -> list[str]:
    qs = TripMember.objects.filter(trip=trip)
    if exclude_user_ids:
        qs = qs.exclude(user_id__in=exclude_user_ids)
    return list(qs.values_list("user__email", flat=True))


def user_emails(*users) -> list[str]:
    return [getattr(user, "email", "") for user in users if user is not None]


def trip_url(trip: Trip) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}/trips/{trip.id}"


def format_trip_period(trip: Trip) -> str:
    if trip.start_date and trip.end_date:
        return f"{trip.start_date:%d.%m.%Y} — {trip.end_date:%d.%m.%Y}"
    if trip.start_date:
        return f"с {trip.start_date:%d.%m.%Y}"
    if trip.end_date:
        return f"до {trip.end_date:%d.%m.%Y}"
    return "не указаны"


def format_date_value(value: date | None) -> str:
    if value is None:
        return "не указана"
    return value.strftime("%d.%m.%Y")


def format_datetime_value(value: datetime | None) -> str:
    if value is None:
        return "не указано"

    current_tz = timezone.get_current_timezone()
    if timezone.is_naive(value):
        localized = timezone.make_aware(value, current_tz)
    else:
        localized = timezone.localtime(value, current_tz)
    return localized.strftime("%d.%m.%Y %H:%M")


def build_trip_message(trip: Trip, lines: list[str]) -> str:
    parts = [
        f"Поездка: {trip.title}",
        f"Даты: {format_trip_period(trip)}",
        "",
        *[line for line in lines if line],
        "",
        f"Открыть поездку: {trip_url(trip)}",
        "",
        "EqualTrip",
    ]
    return "\n".join(parts)


def safe_send_notification(subject: str, message: str, recipients: list[str], log_message: str):
    try:
        send_notification(subject, message, recipients)
    except Exception:
        logging.exception(log_message)
