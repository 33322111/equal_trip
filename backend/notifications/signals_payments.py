from django.db.models.signals import post_save
from django.dispatch import receiver

from payments.models import Settlement
from .email import send_notification


@receiver(post_save, sender=Settlement)
def settlement_created_or_confirmed(sender, instance: Settlement, created, **kwargs):
    trip = instance.trip

    if created:
        # pending → уведомляем получателя
        subject = f"[EqualTrip] Вам отправлена оплата в поездке «{trip.title}»"
        message = (
            f"Пользователь {instance.from_user.username} отметил оплату:\n\n"
            f"Сумма: {instance.amount} {instance.currency}\n"
            f"Статус: ожидает подтверждения"
        )
        recipients = [instance.to_user.email]
    else:
        # confirmed → уведомляем отправителя
        if instance.status != Settlement.Status.CONFIRMED:
            return

        subject = f"[EqualTrip] Оплата подтверждена в поездке «{trip.title}»"
        message = (
            f"Пользователь {instance.to_user.username} подтвердил оплату:\n\n"
            f"Сумма: {instance.amount} {instance.currency}"
        )
        recipients = [instance.from_user.email]

    send_notification(subject, message, recipients)