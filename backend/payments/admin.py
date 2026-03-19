from django.contrib import admin

from .models import Settlement


@admin.register(Settlement)
class SettlementAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "trip",
        "from_user",
        "to_user",
        "amount",
        "currency",
        "status",
        "created_at",
        "confirmed_at",
    )
    list_filter = ("status", "currency", "created_at", "confirmed_at")
    search_fields = (
        "trip__title",
        "from_user__username",
        "from_user__email",
        "to_user__username",
        "to_user__email",
    )
