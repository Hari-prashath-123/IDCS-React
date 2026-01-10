
import uuid
from django.db import models
from django.contrib.auth.models import AbstractUser

# --- 1. Users & Roles ---
class Role(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=50, unique=True)  # e.g., 'student', 'staff', 'hod'
    permissions = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return self.name

class User(AbstractUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    roles = models.ManyToManyField(Role, related_name='users', blank=True)
    # Make email the identifier
    email = models.EmailField(unique=True)
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']

class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    reg_no = models.CharField(max_length=20, blank=True, null=True)
    department = models.ForeignKey('Department', on_delete=models.SET_NULL, null=True, blank=True)
    year = models.IntegerField(null=True, blank=True)
    section = models.CharField(max_length=5, blank=True, null=True)

# --- 2. Organization ---
class Department(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=20, unique=True)

    def __str__(self):
        return self.code

class Course(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=200)
    code = models.CharField(max_length=20)
    department = models.ForeignKey(Department, on_delete=models.CASCADE)

# --- 3. Electives (The Missing Part) ---
class Elective(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=200)
    course_code = models.CharField(max_length=20)
    department = models.ForeignKey(Department, on_delete=models.CASCADE)
    seat_count = models.IntegerField(default=60)
    seats_filled = models.IntegerField(default=0)
    semester = models.IntegerField()
    year = models.IntegerField()
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.title

class StudentElective(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(User, on_delete=models.CASCADE)
    elective = models.ForeignKey(Elective, on_delete=models.CASCADE)
    selected_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('student', 'elective')

# --- 4. Applications & Workflow ---
class Application(models.Model):
    TYPE_CHOICES = [
        ('OD', 'On Duty'),
        ('LEAVE', 'Leave'),
        ('GATEPASS', 'Gate Pass'),
        ('BONAFIDE', 'Bonafide'),
    ]
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('APPROVED', 'Approved'),
        ('REJECTED', 'Rejected'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    current_step = models.IntegerField(default=1)
    payload = models.JSONField(default=dict)  # Stores dates, reasons, etc.
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class WorkflowStep(models.Model):
    application_type = models.CharField(max_length=20)
    step_number = models.IntegerField()
    approver_role = models.ForeignKey(Role, on_delete=models.CASCADE)
    
    class Meta:
        ordering = ['application_type', 'step_number']
