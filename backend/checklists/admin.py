from django.contrib import admin

from .models import Checklist, ChecklistComment, ChecklistItem


class ChecklistItemInline(admin.TabularInline):
    model = ChecklistItem
    extra = 0


class ChecklistCommentInline(admin.TabularInline):
    model = ChecklistComment
    extra = 0


@admin.register(Checklist)
class ChecklistAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "trip", "created_by", "created_at")
    list_filter = ("created_at", "trip")
    search_fields = ("title", "trip__title", "created_by__username", "created_by__email")
    inlines = (ChecklistItemInline,)


@admin.register(ChecklistItem)
class ChecklistItemAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "checklist", "assignee", "is_done", "due_date", "updated_at")
    list_filter = ("is_done", "due_date", "updated_at")
    search_fields = ("title", "checklist__title", "assignee__username", "assignee__email")
    inlines = (ChecklistCommentInline,)


@admin.register(ChecklistComment)
class ChecklistCommentAdmin(admin.ModelAdmin):
    list_display = ("id", "item", "user", "created_at")
    list_filter = ("created_at",)
    search_fields = ("item__title", "user__username", "user__email", "text")
