import uuid
from django.db import transaction
from django.core.exceptions import ValidationError
from django.contrib.auth import get_user_model
from .models import Elective, StudentElective, Application, WorkflowStep, Role

User = get_user_model()

# 1. Elective Selection Service

def select_elective(student_user, elective_id):
    """
    Atomically select an elective for a student, ensuring seat count is enforced at the DB level.
    """
    from django.db.models import F
    with transaction.atomic():
        elective = Elective.objects.select_for_update().get(pk=elective_id)
        if elective.seats_available <= 0:
            raise ValidationError("No seats available for this elective.")
        # Check if already selected
        if StudentElective.objects.filter(student=student_user, elective=elective).exists():
            raise ValidationError("You have already selected this elective.")
        # Create selection and decrement seats
        StudentElective.objects.create(student=student_user, elective=elective)
        elective.seats_available = F('seats_available') - 1
        elective.save()

# 2. Application Processor

def process_approval(application_id, approver_user, action):
    """
    Process an approval step for an application, enforcing workflow rules.
    """
    from django.db.models import Max
    with transaction.atomic():
        app = Application.objects.select_for_update().get(pk=application_id)
        # Get current workflow step
        step = WorkflowStep.objects.get(
            application_type=app.type,
            step_number=app.current_step
        )
        # Check if approver has the required role
        if not approver_user.roles.filter(pk=step.role_id).exists():
            raise ValidationError("You do not have permission to approve this step.")
        # Record approval (could be a related Approval model, not shown here)
        # ...
        if action == 'approved':
            max_step = WorkflowStep.objects.filter(application_type=app.type).aggregate(Max('step_number'))['step_number__max']
            app.current_step += 1
            if app.current_step > max_step:
                app.status = Application.Status.APPROVED
            app.save()
        elif action == 'rejected':
            app.status = Application.Status.REJECTED
            app.save()
        else:
            raise ValidationError("Invalid action.")
