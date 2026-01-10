from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
    TokenVerifyView,
)
from .views import ApplicationViewSet, ElectiveViewSet, StudentElectiveViewSet, UserProfileView

router = DefaultRouter()
router.register(r'applications', ApplicationViewSet, basename='application')
router.register(r'electives', ElectiveViewSet, basename='elective')
router.register(r'student-electives', StudentElectiveViewSet, basename='student-elective')

urlpatterns = [
    path('api/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/token/verify/', TokenVerifyView.as_view(), name='token_verify'),
    path('api/', include(router.urls)),
    path('api/auth/users/me/', UserProfileView.as_view(), name='user-profile'),
]
