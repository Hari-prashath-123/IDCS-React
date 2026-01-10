from rest_framework.views import APIView
from .models import Elective
# StudentElectiveViewSet for /student-electives/
class StudentElectiveViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated, IsStudent]

    def list(self, request):
        # Replace with correct logic for fetching current user's elective selections
        electives = Elective.objects.filter(selected_by=request.user)
        serializer = ElectiveSerializer(electives, many=True)
        return Response(serializer.data)

# UserProfileView for /auth/users/me/
class UserProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        data = {
            "id": str(user.id),
            "username": user.username,
            "email": user.email,
            # Add more fields as needed
        }
        return Response(data)
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import Application, Elective
from .services import select_elective, process_approval
from .permissions import IsStudent
from .serializers import ApplicationSerializer, ElectiveSerializer

class ApplicationViewSet(viewsets.ModelViewSet):
    queryset = Application.objects.all()
    serializer_class = ApplicationSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        # Use ApplicationService (process_approval, etc.) if needed
        serializer.save(user=self.request.user)

class ElectiveViewSet(viewsets.ModelViewSet):
    queryset = Elective.objects.all()
    serializer_class = ElectiveSerializer
    permission_classes = [IsAuthenticated, IsStudent]

    @action(detail=True, methods=['post'])
    def select(self, request, pk=None):
        elective = self.get_object()
        try:
            select_elective(request.user, elective.id)
            return Response({'detail': 'Elective selected successfully.'}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
