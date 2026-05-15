from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User

admin.site.site_header = "Администрирование EqualTrip"
admin.site.site_title = "EqualTrip"
admin.site.index_title = "Панель управления"


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display = ("id", "username", "email", "is_staff", "is_active")
    list_filter = ("is_staff", "is_superuser", "is_active")
    search_fields = ("username", "email", "first_name", "last_name")
