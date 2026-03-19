from django.contrib import admin

from .models import DayPlan, DayPlanComment, DayPlanItem


class DayPlanItemInline(admin.TabularInline):
    model = DayPlanItem
    extra = 0


class DayPlanCommentInline(admin.TabularInline):
    model = DayPlanComment
    extra = 0


@admin.register(DayPlan)
class DayPlanAdmin(admin.ModelAdmin):
    list_display = ("id", "trip", "date", "title", "created_at")
    list_filter = ("date", "created_at", "trip")
    search_fields = ("title", "trip__title")
    inlines = (DayPlanItemInline,)


@admin.register(DayPlanItem)
class DayPlanItemAdmin(admin.ModelAdmin):
    list_display = ("id", "day", "title", "assignee", "is_done", "time_from", "time_to", "updated_at")
    list_filter = ("is_done", "day__trip", "updated_at")
    search_fields = ("title", "day__title", "day__trip__title", "description")
    inlines = (DayPlanCommentInline,)


@admin.register(DayPlanComment)
class DayPlanCommentAdmin(admin.ModelAdmin):
    list_display = ("id", "item", "user", "created_at")
    list_filter = ("created_at",)
    search_fields = ("item__title", "user__username", "text")
