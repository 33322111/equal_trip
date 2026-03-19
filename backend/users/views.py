from rest_framework import generics, permissions
from django.contrib.auth import get_user_model
from rest_framework.response import Response

from .serializers import RegisterSerializer, UserSerializer, ProfileSerializer, UserSearchSerializer
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated


User = get_user_model()


class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]


class MeView(generics.RetrieveAPIView):
    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user


class ProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = ProfileSerializer(request.user)
        return Response(serializer.data)

    def patch(self, request):
        serializer = ProfileSerializer(
            request.user,
            data=request.data,
            partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class UserSearchView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = UserSearchSerializer

    def get_queryset(self):
        q = (self.request.query_params.get("q") or "").strip()
        qs = User.objects.all().order_by("username")
        if not q:
            return qs.none()
        return qs.filter(username__icontains=q)[:20]