from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import Application, Elective, StudentElective
from .serializers import ApplicationSerializer, ElectiveSerializer, StudentElectiveSerializer
from . import services

class ElectiveViewSet(viewsets.ModelViewSet):
    queryset = Elective.objects.all()
    serializer_class = ElectiveSerializer
    permission_classes = [IsAuthenticated]

    @action(detail=True, methods=['post'])
    def select(self, request, pk=None):
        try:
            # Call the service layer to handle locking and logic
            services.select_elective(request.user, pk)
            return Response({'status': 'selected'}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

class ApplicationViewSet(viewsets.ModelViewSet):
    serializer_class = ApplicationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Application.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

class StudentElectiveViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = StudentElectiveSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return StudentElective.objects.filter(student=self.request.user)
