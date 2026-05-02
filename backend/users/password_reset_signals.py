from django.conf import settings
from django.dispatch import receiver
from django_rest_passwordreset.signals import reset_password_token_created
from notifications.email import send_notification


@receiver(reset_password_token_created)
def password_reset_token_created(sender, instance, reset_password_token, **kwargs):
    reset_url = f"{settings.FRONTEND_URL}/reset-password/{reset_password_token.key}"

    send_notification(
        subject="EqualTrip: сброс пароля",
        message=(
            "Вы запросили сброс пароля.\n\n"
            f"Перейдите по ссылке, чтобы задать новый пароль:\n{reset_url}\n\n"
            "Если это были не Вы — просто проигнорируйте письмо."
        ),
        recipients=[reset_password_token.user.email],
    )
