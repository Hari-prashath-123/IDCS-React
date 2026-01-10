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
    with transaction.atomic():
        elective = Elective.objects.select_for_update().get(id=elective_id)
        if elective.seats_filled >= elective.seat_count:
            raise ValidationError("Elective is full")
        if StudentElective.objects.filter(student=student_user, elective=elective).exists():
            raise ValidationError("You have already selected this elective.")
        StudentElective.objects.create(student=student_user, elective=elective)
        elective.seats_filled += 1
        elective.save()

# 2. Application Processor

def process_approval(application_id, approver_user, action):
    """
    Process an approval step for an application, enforcing workflow rules.
    """
    with transaction.atomic():
        app = Application.objects.select_for_update().get(pk=application_id)
        step = WorkflowStep.objects.get(
            application_type=app.type,
            step_number=app.current_step
        )
        if not approver_user.roles.filter(pk=step.role_id).exists():
            raise ValidationError("You do not have permission to approve this step.")
        # Record approval (not shown)
        if action == 'APPROVE':
            max_step = WorkflowStep.objects.filter(application_type=app.type).aggregate_max('step_number')
            if app.current_step < max_step:
                app.current_step += 1
            else:
                app.status = 'APPROVED'
            app.save()
        elif action == 'REJECT':
            app.status = 'REJECTED'
            app.save()
        else:
            raise ValidationError("Invalid action.")
