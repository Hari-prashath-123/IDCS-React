from django.urls import path, include
from rest_framework.routers import DefaultRouter
# Explicitly import the ViewSets defined in views.py
from .views import ElectiveViewSet, ApplicationViewSet, StudentElectiveViewSet

router = DefaultRouter()
router.register(r'electives', ElectiveViewSet, basename='elective')
router.register(r'applications', ApplicationViewSet, basename='application')
router.register(r'student-electives', StudentElectiveViewSet, basename='student-elective')

urlpatterns = [
    path('api/', include(router.urls)),
]
