from django.conf import settings
from django.core.mail import send_mail
from django.dispatch import receiver
from django_rest_passwordreset.signals import reset_password_token_created


@receiver(reset_password_token_created)
def password_reset_token_created(sender, instance, reset_password_token, **kwargs):
    # reset_password_token.key – токен для подтверждения
    reset_url = f"{settings.FRONTEND_URL}/reset-password/{reset_password_token.key}"

    send_mail(
        subject="EqualTrip: сброс пароля",
        message=(
            "Вы запросили сброс пароля.\n\n"
            f"Перейдите по ссылке, чтобы задать новый пароль:\n{reset_url}\n\n"
            "Если это были не Вы — просто проигнорируйте письмо."
        ),
        from_email=getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@equaltrip.local"),
        recipient_list=[reset_password_token.user.email],
        fail_silently=False,
    )