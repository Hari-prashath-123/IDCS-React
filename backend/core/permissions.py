from rest_framework.permissions import BasePermission

class IsStudent(BasePermission):
    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated and request.user.roles.filter(name__iexact='student').exists()

class IsStaff(BasePermission):
    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated and request.user.roles.filter(name__iexact='staff').exists()

class IsHOD(BasePermission):
    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated and request.user.roles.filter(name__iexact='hod').exists()
