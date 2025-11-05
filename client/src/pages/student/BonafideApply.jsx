import React, { useState } from 'react';
import { Card, Form, Button } from 'react-bootstrap';
import studentService from '../../services/student.service';

const BonafideApply = () => {
  const [formData, setFormData] = useState({
    name: '',
    regNo: '',
    department: '',
    reason: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await studentService.applyBonafide(formData);
      setSuccess('Application submitted successfully!');
      setFormData({ name: '', regNo: '', department: '', reason: '' });
    } catch (err) {
      setError('Failed to submit application.');
    }
    setLoading(false);
  };

  return (
    <Card className="mx-auto mt-5" style={{ maxWidth: 500 }}>
      <Card.Header as="h4" className="text-center">Bonafide Application Form</Card.Header>
      <Card.Body>
        <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-3" controlId="formName">
            <Form.Label>Name</Form.Label>
            <Form.Control
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              placeholder="Enter your name"
            />
          </Form.Group>
          <Form.Group className="mb-3" controlId="formRegNo">
            <Form.Label>Register Number</Form.Label>
            <Form.Control
              type="text"
              name="regNo"
              value={formData.regNo}
              onChange={handleChange}
              required
              placeholder="Enter your register number"
            />
          </Form.Group>
          <Form.Group className="mb-3" controlId="formDepartment">
            <Form.Label>Department</Form.Label>
            <Form.Control
              type="text"
              name="department"
              value={formData.department}
              onChange={handleChange}
              required
              placeholder="Enter your department"
            />
          </Form.Group>
          <Form.Group className="mb-3" controlId="formReason">
            <Form.Label>Reason</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              name="reason"
              value={formData.reason}
              onChange={handleChange}
              required
              placeholder="State your reason"
            />
          </Form.Group>
          {error && <div className="text-danger mb-2">{error}</div>}
          {success && <div className="text-success mb-2">{success}</div>}
          <Button variant="primary" type="submit" disabled={loading} className="w-100">
            {loading ? 'Submitting...' : 'Submit'}
          </Button>
        </Form>
      </Card.Body>
    </Card>
  );
};

export default BonafideApply;
