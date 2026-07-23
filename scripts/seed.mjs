import bcrypt from "bcryptjs";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function seed() {
  const adminHash = await bcrypt.hash("Admin@123", 10);
  const pharmHash = await bcrypt.hash("Pharm@123", 10);
  const custHash = await bcrypt.hash("Customer@123", 10);

  // Users
  await pool.query(`
    INSERT INTO users (name, email, password_hash, phone, role) VALUES
    ('Admin User', 'admin@pharma.com', $1, '+1-555-1000', 'admin'),
    ('Dr. Sarah Patel', 'sarah.patel@pharma.com', $2, '+1-555-2000', 'pharmacist'),
    ('John Smith', 'john.smith@email.com', $3, '+1-555-3000', 'customer'),
    ('Emily Johnson', 'emily.j@email.com', $3, '+1-555-3001', 'customer')
    ON CONFLICT (email) DO NOTHING
  `, [adminHash, pharmHash, custHash]);
  console.log("✓ Users seeded");

  // Categories
  await pool.query(`
    INSERT INTO categories (name, description) VALUES
    ('Analgesics', 'Pain relief medications'),
    ('Antibiotics', 'Bacterial infection treatments'),
    ('Antihistamines', 'Allergy relief medications'),
    ('Cardiovascular', 'Heart and blood pressure medications'),
    ('Diabetes', 'Blood sugar management medications'),
    ('Vitamins & Supplements', 'Nutritional supplements'),
    ('Dermatology', 'Skin care and treatment medications'),
    ('Respiratory', 'Breathing and lung medications')
    ON CONFLICT (name) DO NOTHING
  `);
  console.log("✓ Categories seeded");

  // Suppliers
  await pool.query(`
    INSERT INTO suppliers (name, contact_name, email, phone, address) VALUES
    ('MedSupply Co.', 'James Carter', 'james@medsupply.com', '+1-555-0101', '123 Pharma Ave, Boston, MA'),
    ('GlobalPharm Ltd.', 'Sarah Mitchell', 'sarah@globalpharm.com', '+1-555-0202', '456 Health Blvd, Chicago, IL'),
    ('BioMed Distributors', 'Robert Chen', 'rchen@biomed.com', '+1-555-0303', '789 Wellness Rd, San Francisco, CA')
    ON CONFLICT DO NOTHING
  `);
  console.log("✓ Suppliers seeded");

  // Get IDs
  const { rows: cats } = await pool.query("SELECT id, name FROM categories");
  const { rows: sups } = await pool.query("SELECT id, name FROM suppliers");
  const catMap = Object.fromEntries(cats.map(c => [c.name, c.id]));
  const sup0 = sups[0]?.id;
  const sup1 = sups[1]?.id;

  // Medicines
  const today = new Date();
  const exp1 = new Date(today); exp1.setFullYear(exp1.getFullYear() + 2);
  const exp2 = new Date(today); exp2.setMonth(exp2.getMonth() + 2); // near-expiry
  const exp3 = new Date(today); exp3.setFullYear(exp3.getFullYear() + 1);
  const fmt = d => d.toISOString().split("T")[0];

  await pool.query(`
    INSERT INTO medicines (name, generic_name, category_id, supplier_id, manufacturer, batch_number, expiry_date, quantity, price, prescription_required, description) VALUES
    ('Paracetamol 500mg', 'Acetaminophen', $1, $9, 'PharmaCorp', 'PCM-2024-01', $10, 250, 4.99, false, 'Standard pain and fever relief'),
    ('Ibuprofen 400mg', 'Ibuprofen', $1, $9, 'MedCo', 'IBU-2024-02', $10, 8, 6.49, false, 'Anti-inflammatory pain relief'),
    ('Amoxicillin 500mg', 'Amoxicillin', $2, $9, 'BioPharm', 'AMX-2024-01', $11, 120, 12.99, true, 'Broad-spectrum antibiotic'),
    ('Azithromycin 250mg', 'Azithromycin', $2, $10, 'GlobalMed', 'AZI-2024-01', $10, 60, 18.99, true, 'Antibiotic for respiratory infections'),
    ('Cetirizine 10mg', 'Cetirizine', $3, $9, 'AllergyMed', 'CET-2024-01', $10, 5, 8.99, false, 'Allergy relief antihistamine'),
    ('Loratadine 10mg', 'Loratadine', $3, $10, 'PharmaCorp', 'LOR-2024-01', $10, 180, 7.49, false, 'Non-drowsy allergy relief'),
    ('Atorvastatin 20mg', 'Atorvastatin', $4, $10, 'CardioMed', 'ATV-2024-01', $10, 90, 24.99, true, 'Cholesterol management'),
    ('Metformin 500mg', 'Metformin', $5, $9, 'DiabetCare', 'MET-2024-01', $10, 200, 9.99, true, 'Type 2 diabetes management'),
    ('Vitamin D3 1000IU', 'Cholecalciferol', $6, $10, 'VitaSupply', 'VD3-2024-01', $10, 300, 11.99, false, 'Bone health supplement'),
    ('Omega-3 Fish Oil', 'Omega-3 fatty acids', $6, $9, 'NutriCo', 'OMG-2024-01', $10, 150, 19.99, false, 'Heart and brain health supplement'),
    ('Hydrocortisone Cream 1%', 'Hydrocortisone', $7, $10, 'DermaCare', 'HYD-2024-01', $11, 0, 5.99, false, 'Mild corticosteroid for skin irritation'),
    ('Salbutamol Inhaler', 'Albuterol', $8, $9, 'RespiraMed', 'SAL-2024-01', $10, 40, 29.99, true, 'Bronchodilator for asthma relief')
    ON CONFLICT DO NOTHING
  `, [
    catMap['Analgesics'], catMap['Antibiotics'], catMap['Antihistamines'],
    catMap['Cardiovascular'], catMap['Diabetes'], catMap['Vitamins & Supplements'],
    catMap['Dermatology'], catMap['Respiratory'],
    sup0, sup1,
    fmt(exp1), fmt(exp2), fmt(exp3)
  ]);
  console.log("✓ Medicines seeded");

  await pool.end();
  console.log("✓ Seed complete");
}

seed().catch(err => { console.error(err); process.exit(1); });
