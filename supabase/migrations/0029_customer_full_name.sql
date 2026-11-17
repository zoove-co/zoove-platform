-- Customers who typed their name in the app had first_name set but full_name empty, so ops and trainers saw "Customer".
-- Fill the gap once; the API keeps full_name in step from now on. Only rows with no full_name are touched.
update users set full_name = nullif(btrim(concat_ws(' ', first_name, last_name)), '') where full_name is null and first_name is not null;
