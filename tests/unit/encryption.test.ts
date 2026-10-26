import { FieldEncryptionService } from '../../src/security/encryption';

describe('FieldEncryptionService (AES-256-GCM & HMAC-SHA256)', () => {
  const encryptionService = new FieldEncryptionService();

  it('should encrypt and decrypt string data correctly', () => {
    const sensitiveData = 'Patient has chronic digestive discomfort and vata imbalance';
    const encrypted = encryptionService.encrypt(sensitiveData);

    expect(encrypted).not.toEqual(sensitiveData);
    expect(typeof encrypted).toBe('string');

    const decrypted = encryptionService.decrypt<string>(encrypted);
    expect(decrypted).toEqual(sensitiveData);
  });

  it('should encrypt and decrypt complex JSON objects correctly', () => {
    const clinicalRecord = {
      bloodPressure: '120/80',
      symptoms: ['Migraine', 'Fatigue'],
      treatmentPlan: 'Triphala churnam 5g at bedtime with warm water'
    };

    const encrypted = encryptionService.encrypt(clinicalRecord);
    const decrypted = encryptionService.decrypt<typeof clinicalRecord>(encrypted);

    expect(decrypted).toEqual(clinicalRecord);
  });

  it('should fail decryption if ciphertext or authentication tag is tampered with', () => {
    const sensitiveData = 'Secret Medical Note';
    const encryptedBase64 = encryptionService.encrypt(sensitiveData);

    const json = JSON.parse(Buffer.from(encryptedBase64, 'base64').toString('utf8'));
    // Tamper with ciphertext
    json.ciphertext = json.ciphertext.substring(0, json.ciphertext.length - 2) + 'aa';
    const tamperedBase64 = Buffer.from(JSON.stringify(json)).toString('base64');

    expect(() => {
      encryptionService.decrypt(tamperedBase64);
    }).toThrow(/Decryption failed or data integrity compromised/);
  });

  it('should generate and verify HMAC-SHA256 digital signatures for prescriptions', () => {
    const prescriptionData = {
      consultationId: 'c123',
      doctorId: 'd456',
      medications: ['Ashwagandha 500mg']
    };

    const signature = encryptionService.signPrescription(prescriptionData);
    expect(typeof signature).toBe('string');
    expect(signature.length).toBe(64); // SHA-256 hex string length

    const isValid = encryptionService.verifySignature(prescriptionData, signature);
    expect(isValid).toBe(true);

    const isTampered = encryptionService.verifySignature(
      { ...prescriptionData, doctorId: 'attacker' },
      signature
    );
    expect(isTampered).toBe(false);
  });
});
