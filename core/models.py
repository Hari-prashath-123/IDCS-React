import uuid
from django.db import models
from django.contrib.auth.models import AbstractUser
from django.contrib.postgres.fields import JSONField

# 1. Role Model (for permissions and role management)
class Role(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=64, unique=True)
    permissions = JSONField(default=dict, blank=True)  # e.g., {"can_approve_leave": True}

    def __str__(self):
        return self.name

# 1. Custom User Model
class User(AbstractUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    username = models.CharField(max_length=150, unique=True)
    email = models.EmailField(unique=True)
    roles = models.ManyToManyField(Role, related_name='users', blank=True)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']

    def __str__(self):
        return self.email

# 2. Domain Models
class Department(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=128, unique=True)

    def __str__(self):
        return self.name

class Course(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=128)
    code = models.CharField(max_length=32, unique=True)
    department = models.ForeignKey(Department, on_delete=models.CASCADE, related_name='courses')

    def __str__(self):
        return f"{self.code} - {self.name}"

class AcademicYear(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    year = models.PositiveIntegerField(unique=True)

    def __str__(self):
        return str(self.year)

class UserProfile(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    reg_no = models.CharField(max_length=32, unique=True, null=True, blank=True)
    year = models.ForeignKey(AcademicYear, on_delete=models.SET_NULL, null=True, blank=True)
    section = models.CharField(max_length=8, blank=True, null=True)

    def __str__(self):
        return f"Profile of {self.user.email}"

# 3. Application Model
class Application(models.Model):
    class ApplicationType(models.TextChoices):
        OD = 'OD', 'On Duty'
        LEAVE = 'LEAVE', 'Leave'
        GATEPASS = 'GATEPASS', 'Gatepass'
        BONAFIDE = 'BONAFIDE', 'Bonafide'

    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        APPROVED = 'APPROVED', 'Approved'
        REJECTED = 'REJECTED', 'Rejected'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='applications')
    type = models.CharField(max_length=16, choices=ApplicationType.choices)
    current_step = models.PositiveIntegerField(default=1)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    payload = JSONField(default=dict, blank=True)  # Store type-specific data
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.get_type_display()} Application by {self.user.email}"

# 4. Workflow Rules
class WorkflowStep(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    application_type = models.CharField(max_length=16, choices=Application.ApplicationType.choices)
    step_number = models.PositiveIntegerField()
    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name='workflow_steps')
    description = models.CharField(max_length=128, blank=True)

    class Meta:
        unique_together = ('application_type', 'step_number')
        ordering = ['application_type', 'step_number']

    def __str__(self):
        return f"{self.application_type} Step {self.step_number}: {self.role.name}"
