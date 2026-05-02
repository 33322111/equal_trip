from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver

from expenses.models import Expense
from .utils import build_trip_message, format_datetime_value, safe_send_notification, trip_member_emails


@receiver(post_save, sender=Expense)
def expense_created_or_updated(sender, instance: Expense, created, **kwargs):
    trip = instance.trip
    author = instance.created_by
    recipients = trip_member_emails(trip, exclude_user_ids=[author.id])
    category_name = instance.category.name if instance.category else "Без категории"
    details = [
        f"Автор: {author.username}",
        f"Название расхода: {instance.title}",
        f"Категория: {category_name}",
        f"Сумма: {instance.amount} {instance.currency}",
        f"Сумма в RUB: {instance.amount_rub} RUB",
        f"Дата расхода: {format_datetime_value(instance.spent_at)}",
        f"Чек: {'прикреплён' if bool(instance.receipt) else 'не прикреплён'}",
    ]
    if instance.lat is not None and instance.lng is not None:
        details.append(f"Координаты: {instance.lat}, {instance.lng}")

    if created:
        subject = f"[EqualTrip] Новый расход в поездке «{trip.title}»"
        message = build_trip_message(trip, [f"Пользователь {author.username} добавил новый расход.", *details])
    else:
        subject = f"[EqualTrip] Расход обновлён в поездке «{trip.title}»"
        message = build_trip_message(trip, [f"Пользователь {author.username} обновил расход.", *details])

    safe_send_notification(subject, message, recipients, "Failed to send expense notification email")

@receiver(post_delete, sender=Expense)
def expense_deleted(sender, instance: Expense, **kwargs):
    trip = instance.trip
    author = instance.created_by
    recipients = trip_member_emails(trip)
    category_name = instance.category.name if instance.category else "Без категории"

    subject = f"[EqualTrip] Расход удалён в поездке «{trip.title}»"
    message = build_trip_message(
        trip,
        [
            f"Пользователь {author.username} удалил расход.",
            f"Название расхода: {instance.title}",
            f"Категория: {category_name}",
            f"Сумма: {instance.amount} {instance.currency}",
            f"Сумма в RUB: {instance.amount_rub} RUB",
            f"Дата расхода: {format_datetime_value(instance.spent_at)}",
        ],
    )

    safe_send_notification(subject, message, recipients, "Failed to send expense notification email")
