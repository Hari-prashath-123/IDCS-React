import React, { useState } from 'react';
import '../../assets/css/styles.css';

const GatepassApply = () => {
  const [form, setForm] = useState({ reason: '', startDate: '', endDate: '' });
  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });
  const handleSubmit = e => {
    e.preventDefault();
    // TODO: Call applyGatepass service
  };
  return (
    <form onSubmit={handleSubmit}>
      <h2>Apply for Gatepass</h2>
      <input name="reason" placeholder="Reason" value={form.reason} onChange={handleChange} required />
      <input name="startDate" type="date" value={form.startDate} onChange={handleChange} required />
      <input name="endDate" type="date" value={form.endDate} onChange={handleChange} required />
      <button type="submit">Submit</button>
    </form>
  );
};
export default GatepassApply;
