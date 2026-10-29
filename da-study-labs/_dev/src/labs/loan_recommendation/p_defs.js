  var AP = DATA.applicants, HI = DATA.history, PR = DATA.products;
  var ACOLS = ["applicant_id", "monthly_income", "existing_installments", "credit_score", "requested_amount", "requested_term"];
  var HCOLS = ["history_id", "applicant_id", "product_type", "opened", "amount", "max_dpd", "status"];
  var PCOLS = ["product_id", "name", "min_score", "min_income", "max_amount", "max_term", "flat_rate", "max_dti", "thin_file_ok"];
  var res = DATA.res;
