import { supabase } from '../config/supabaseClient';

/**
 * Tests the connection to Supabase by querying the students table.
 */
export async function testDatabaseConnection() {
  console.log('Testing Supabase connection...');
  try {
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .limit(1);

    if (error) {
      throw error;
    }

    console.log('Supabase Connection Successful. Sample data:', data);
  } catch (error: any) {
    console.error('Error testing Supabase connection:', error.message);
    console.log('Note: Ensure the "students" table exists in your Supabase project.');
  }
}
