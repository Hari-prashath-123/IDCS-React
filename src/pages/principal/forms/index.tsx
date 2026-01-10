import { useState } from 'react';
import PrincipalFormsPage from './PrincipalFormsPage';

export default function PrincipalFormsRouter() {
  // This is a simple router for the principal forms page
  // You can replace this with react-router if needed
  useState<'od' | 'leave' | 'bonafide' | 'gatepass'>('od');

  return (
    <PrincipalFormsPage />
  );
}
