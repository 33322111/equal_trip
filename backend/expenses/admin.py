from django.contrib import admin

from .models import ExchangeRate, Expense, ExpenseCategory, ExpenseShare


class ExpenseShareInline(admin.TabularInline):
    model = ExpenseShare
    extra = 0


@admin.register(ExpenseCategory)
class ExpenseCategoryAdmin(admin.ModelAdmin):
    list_display = ("id", "name")
    search_fields = ("name",)


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "title",
        "trip",
        "created_by",
        "amount",
        "currency",
        "amount_rub",
        "category",
        "created_at",
    )
    list_filter = ("currency", "category", "created_at", "trip")
    search_fields = ("title", "trip__title", "created_by__username", "created_by__email")
    inlines = (ExpenseShareInline,)


@admin.register(ExpenseShare)
class ExpenseShareAdmin(admin.ModelAdmin):
    list_display = ("id", "expense", "user", "weight")
    list_filter = ("user",)
    search_fields = ("expense__title", "user__username", "user__email")


@admin.register(ExchangeRate)
class ExchangeRateAdmin(admin.ModelAdmin):
    list_display = ("id", "currency", "date", "rate_to_rub")
    list_filter = ("currency", "date")
    search_fields = ("currency",)
