import React, { useState } from 'react';
import '../../assets/css/styles.css';

const CertificateUpload = () => {
  const [file, setFile] = useState(null);
  const handleChange = e => setFile(e.target.files[0]);
  const handleSubmit = e => {
    e.preventDefault();
    // TODO: Call uploadCertificate service
  };
  return (
    <form onSubmit={handleSubmit}>
      <h2>Upload Certificate</h2>
      <input type="file" name="certificate" onChange={handleChange} required />
      <button type="submit">Upload</button>
    </form>
  );
};
export default CertificateUpload;
