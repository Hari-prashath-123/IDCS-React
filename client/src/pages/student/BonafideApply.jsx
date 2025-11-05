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
    <div className="animated fadeIn mt-4">
      <div className="row justify-content-center">
        <div className="col-lg-12">
          <div className="card">
            <div className="card-header" style={{ borderRadius: '8px 8px 0px 0px' }}>
              <span className="header-title">Bonafide Application</span>
              <a href="/student/dashboard" className="home-icon">
                <i className="fa fa-home"></i>
              </a>
            </div>
            <div className="card-body">
              <form onSubmit={handleSubmit}>
                {/* Example: Purpose and Father's Name */}
                <div className="form-row">
                  <div className="form-group col-md-6">
                    <label htmlFor="purpose">Purpose (Subject)</label>
                    <select className="form-control" id="purpose" name="purpose" value={formData.purpose || ''} onChange={handleChange} required>
                      <option value="">Select Purpose</option>
                      <option>Bank Loan</option>
                      <option>Fee Structure</option>
                      <option>Scholarship</option>
                      <option>Passport</option>
                      <option>Bus Pass</option>
                      <option>Train Pass</option>
                      <option>Bonafide</option>
                      <option>Other</option>
                    </select>
                  </div>
                  <div className="form-group col-md-6">
                    <label htmlFor="fathers_name">Father’s Name</label>
                    <input type="text" className="form-control" id="fathers_name" name="fathers_name" value={formData.fathers_name || ''} onChange={handleChange} required />
                  </div>
                </div>
                {/* Example: Branch, Year, Community */}
                <div className="form-row">
                  <div className="form-group col-md-4">
                    <label htmlFor="branch">Branch</label>
                    <select className="form-control" id="branch" name="branch" value={formData.branch || ''} onChange={handleChange} required>
                      <option value="">Select Branch</option>
                      <option>AI & DS</option>
                      <option>AI ML</option>
                      <option>CSE</option>
                      <option>IT</option>
                      <option>ECE</option>
                      <option>EEE</option>
                      <option>MECH</option>
                      <option>CIVIL</option>
                    </select>
                  </div>
                  <div className="form-group col-md-4">
                    <label htmlFor="year">Year</label>
                    <select className="form-control" id="year" name="year" value={formData.year || ''} onChange={handleChange} required>
                      <option value="">Select Year</option>
                      <option>I</option>
                      <option>II</option>
                      <option>III</option>
                      <option>IV</option>
                    </select>
                  </div>
                  <div className="form-group col-md-4">
                    <label htmlFor="community">Community</label>
                    <select className="form-control" id="community" name="community" value={formData.community || ''} onChange={handleChange} required>
                      <option value="">Select Community</option>
                      <option>OC</option>
                      <option>BC</option>
                      <option>MBC</option>
                      <option>SC</option>
                      <option>ST</option>
                      <option>Others</option>
                    </select>
                  </div>
                </div>
                {/* Example: Date */}
                <div className="form-row">
                  <div className="form-group col-md-3">
                    <label htmlFor="date">Date</label>
                    <input type="date" className="form-control" id="date" name="date" value={formData.date || ''} onChange={handleChange} required />
                  </div>
                </div>
                {/* Example: Reason */}
                <div className="form-group">
                  <label htmlFor="reason">Reason</label>
                  <textarea className="form-control" id="reason" name="reason" rows={3} value={formData.reason || ''} onChange={handleChange} required />
                </div>
                {/* Example: Proof upload */}
                <div className="form-group">
                  <label htmlFor="proof">Proof (optional)</label><br />
                  <label className="custom-file-upload">
                    <input type="file" id="proof" name="proof" accept="image/*,application/pdf" />
                    Choose File
                  </label>
                  <span id="file-name" style={{ marginLeft: 10, fontWeight: 500 }}>No file chosen</span>
                </div>
                {/* Error/Success messages */}
                {error && <div className="text-danger mb-2">{error}</div>}
                {success && <div className="text-success mb-2">{success}</div>}
                {/* Buttons */}
                <div className="btn-group mt-3" style={{ width: '100%' }}>
                  <button type="submit" className="btn btn-submit mr-2 col-md-8" disabled={loading}>
                    {loading ? 'Submitting...' : 'Submit'}
                  </button>
                  <button type="reset" className="btn btn-reset col-md-4">Reset</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BonafideApply;
