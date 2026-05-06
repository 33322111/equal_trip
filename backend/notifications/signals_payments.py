from django.db.models.signals import post_save
from django.dispatch import receiver

from payments.models import Settlement
from .utils import build_trip_message, format_datetime_value, safe_send_notification, user_emails


@receiver(post_save, sender=Settlement)
def settlement_created_or_confirmed(sender, instance: Settlement, created, **kwargs):
    trip = instance.trip

    if created:
        subject = f"[EqualTrip] Вам отправлена оплата в поездке «{trip.title}»"
        message = build_trip_message(
            trip,
            [
                f"Пользователь {instance.from_user.username} отметил оплату в вашу сторону.",
                f"Отправитель: {instance.from_user.username}",
                f"Получатель: {instance.to_user.username}",
                f"Сумма: {instance.amount} {instance.currency}",
                f"Статус: ожидает подтверждения",
                f"Скриншот перевода: {'прикреплён' if bool(instance.proof) else 'не прикреплён'}",
                f"Создано: {format_datetime_value(instance.created_at)}",
            ],
        )
        recipients = user_emails(instance.to_user)
    else:
        if instance.status != Settlement.Status.CONFIRMED:
            return

        subject = f"[EqualTrip] Оплата подтверждена в поездке «{trip.title}»"
        message = build_trip_message(
            trip,
            [
                f"Пользователь {instance.to_user.username} подтвердил оплату.",
                f"Отправитель: {instance.from_user.username}",
                f"Получатель: {instance.to_user.username}",
                f"Сумма: {instance.amount} {instance.currency}",
                f"Статус: подтверждена",
                f"Подтверждено: {format_datetime_value(instance.confirmed_at)}",
            ],
        )
        recipients = user_emails(instance.from_user)

    safe_send_notification(subject, message, recipients, "Failed to send payment notification email")
