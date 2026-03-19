from django.contrib import admin

from .models import Trip, TripInvite, TripMember


class TripMemberInline(admin.TabularInline):
    model = TripMember
    extra = 0


class TripInviteInline(admin.TabularInline):
    model = TripInvite
    extra = 0
    readonly_fields = ("token", "created_at", "used_at")


@admin.register(Trip)
class TripAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "owner", "start_date", "end_date", "created_at")
    list_filter = ("start_date", "end_date", "created_at")
    search_fields = ("title", "description", "owner__username", "owner__email")
    inlines = (TripMemberInline, TripInviteInline)


@admin.register(TripMember)
class TripMemberAdmin(admin.ModelAdmin):
    list_display = ("id", "trip", "user", "role", "joined_at")
    list_filter = ("role", "joined_at")
    search_fields = ("trip__title", "user__username", "user__email")


@admin.register(TripInvite)
class TripInviteAdmin(admin.ModelAdmin):
    list_display = ("id", "trip", "token", "created_by", "is_used", "expires_at", "used_by")
    list_filter = ("is_used", "created_at", "expires_at")
    search_fields = ("trip__title", "created_by__username", "used_by__username", "token")
    readonly_fields = ("token", "created_at", "used_at")
