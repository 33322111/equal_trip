from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver

from expenses.models import Expense
from trips.models import TripMember
from .email import send_notification


@receiver(post_save, sender=Expense)
def expense_created_or_updated(sender, instance: Expense, created, **kwargs):
    trip = instance.trip
    author = instance.created_by

    recipients = list(
        TripMember.objects
        .filter(trip=trip)
        .exclude(user=author)
        .values_list("user__email", flat=True)
    )

    if created:
        subject = f"[EqualTrip] Новый расход в поездке «{trip.title}»"
        message = (
            f"Пользователь {author.username} добавил новый расход:\n\n"
            f"{instance.title}\n"
            f"Сумма: {instance.amount} {instance.currency}\n"
        )
    else:
        subject = f"[EqualTrip] Расход обновлён в поездке «{trip.title}»"
        message = (
            f"Пользователь {author.username} обновил расход:\n\n"
            f"{instance.title}\n"
            f"Сумма: {instance.amount} {instance.currency}\n"
        )

    send_notification(subject, message, recipients)


@receiver(post_delete, sender=Expense)
def expense_deleted(sender, instance: Expense, **kwargs):
    trip = instance.trip
    author = instance.created_by

    recipients = list(
        TripMember.objects
        .filter(trip=trip)
        .values_list("user__email", flat=True)
    )

    subject = f"[EqualTrip] Расход удалён в поездке «{trip.title}»"
    message = (
        f"Пользователь {author.username} удалил расход:\n\n"
        f"{instance.title}\n"
        f"Сумма: {instance.amount} {instance.currency}\n"
    )

    send_notification(subject, message, recipients)