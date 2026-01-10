
from rest_framework import serializers
from .models import Application, Elective, StudentElective, User, Department

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name']

class ElectiveSerializer(serializers.ModelSerializer):
    seats_available = serializers.SerializerMethodField()

    class Meta:
        model = Elective
        fields = '__all__'

    def get_seats_available(self, obj):
        return obj.seat_count - obj.seats_filled

class StudentElectiveSerializer(serializers.ModelSerializer):
    elective = ElectiveSerializer(read_only=True)
    class Meta:
        model = StudentElective
        fields = '__all__'

class ApplicationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Application
        fields = '__all__'
        read_only_fields = ['user', 'status', 'current_step']
