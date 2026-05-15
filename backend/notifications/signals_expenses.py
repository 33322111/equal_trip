from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver

from expenses.models import Expense
from .utils import build_trip_message, format_datetime_value, safe_send_notification, trip_member_emails


_EXPENSE_NOTIFICATION_TRACKED_FIELDS = (
    "trip_id",
    "created_by_id",
    "title",
    "amount",
    "currency",
    "amount_rub",
    "fx_rate",
    "category_id",
    "spent_at",
    "spent_time_known",
    "spent_date_local",
    "lat",
    "lng",
    "receipt",
)


def _receipt_name(value):
    return getattr(value, "name", value) or None


def _capture_expense_state(expense: Expense):
    return {
        "trip_id": expense.trip_id,
        "created_by_id": expense.created_by_id,
        "title": expense.title,
        "amount": expense.amount,
        "currency": expense.currency,
        "amount_rub": expense.amount_rub,
        "fx_rate": expense.fx_rate,
        "category_id": expense.category_id,
        "spent_at": expense.spent_at,
        "spent_time_known": expense.spent_time_known,
        "spent_date_local": expense.spent_date_local,
        "lat": expense.lat,
        "lng": expense.lng,
        "receipt": _receipt_name(expense.receipt),
    }


@receiver(pre_save, sender=Expense)
def capture_previous_expense_state(sender, instance: Expense, **kwargs):
    if not instance.pk:
        return

    try:
        previous = sender.objects.get(pk=instance.pk)
    except sender.DoesNotExist:
        return

    instance._notification_previous_state = _capture_expense_state(previous)


@receiver(post_save, sender=Expense)
def expense_created_or_updated(sender, instance: Expense, created, **kwargs):
    previous_state = getattr(instance, "_notification_previous_state", None)
    if not created and previous_state is not None:
        current_state = _capture_expense_state(instance)
        receipt_changed = previous_state["receipt"] != current_state["receipt"]
        non_receipt_changed = any(
            previous_state[field] != current_state[field]
            for field in _EXPENSE_NOTIFICATION_TRACKED_FIELDS
            if field != "receipt"
        )
        if receipt_changed and not non_receipt_changed:
            return

    trip = instance.trip
    author = instance.created_by
    actor = getattr(instance, "_notification_actor", author)
    exclude_user_ids = [actor.id] if getattr(actor, "id", None) is not None else None
    recipients = trip_member_emails(trip, exclude_user_ids=exclude_user_ids)
    category_name = instance.category.name if instance.category else "Без категории"
    details = [
        f"Автор: {author.username}",
        f"Название расхода: {instance.title}",
        f"Категория: {category_name}",
        f"Сумма: {instance.amount} {instance.currency}",
        f"Сумма в RUB: {instance.amount_rub} RUB",
        (
            "Дата расхода: "
            f"{format_datetime_value(instance.spent_at, include_time=instance.spent_time_known, date_only_value=instance.spent_date_local)}"
        ),
        f"Чек: {'прикреплён' if bool(instance.receipt) else 'не прикреплён'}",
    ]
    if instance.lat is not None and instance.lng is not None:
        details.append(f"Координаты: {instance.lat}, {instance.lng}")

    if created:
        subject = f"[EqualTrip] Новый расход в поездке «{trip.title}»"
        message = build_trip_message(trip, [f"Пользователь {actor.username} добавил новый расход.", *details])
    else:
        subject = f"[EqualTrip] Расход обновлён в поездке «{trip.title}»"
        message = build_trip_message(trip, [f"Пользователь {actor.username} обновил расход.", *details])

    safe_send_notification(subject, message, recipients, "Failed to send expense notification email")


@receiver(post_delete, sender=Expense)
def expense_deleted(sender, instance: Expense, **kwargs):
    trip = instance.trip
    author = instance.created_by
    actor = getattr(instance, "_notification_actor", author)
    exclude_user_ids = [actor.id] if getattr(actor, "id", None) is not None else None
    recipients = trip_member_emails(trip, exclude_user_ids=exclude_user_ids)
    category_name = instance.category.name if instance.category else "Без категории"

    subject = f"[EqualTrip] Расход удалён в поездке «{trip.title}»"
    message = build_trip_message(
        trip,
        [
            f"Пользователь {actor.username} удалил расход.",
            f"Название расхода: {instance.title}",
            f"Категория: {category_name}",
            f"Сумма: {instance.amount} {instance.currency}",
            f"Сумма в RUB: {instance.amount_rub} RUB",
            (
                "Дата расхода: "
                f"{format_datetime_value(instance.spent_at, include_time=instance.spent_time_known, date_only_value=instance.spent_date_local)}"
            ),
        ],
    )

    safe_send_notification(subject, message, recipients, "Failed to send expense notification email")
