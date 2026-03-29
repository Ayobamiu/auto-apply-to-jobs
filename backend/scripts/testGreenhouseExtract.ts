// scripts/testGreenhouseExtract.ts
import { chromium } from 'playwright';
import { extractGreenhouseForm, GreenhouseSiteFormExtractor } from '../greenhouse/extractor.js';
import { classifyAllFields } from '../shared/form-extraction/field-classifier.js';
import { GeneratedAnswer } from '../shared/types.js';

const TEST_URLS = [
    { label: 'Type 1', url: 'https://job-boards.greenhouse.io/thesciongroupllc/jobs/8469910002', jobRef: 'scion-8469910002' },
    // { label: 'Type 2a', url: 'https://careers.airbnb.com/positions/7738432/?gh_jid=7738432', jobRef: 'airbnb-7738432' },
    // { label: 'Type 2b', url: 'https://stripe.com/jobs/listing/account-executive-ai-sales/7546284', jobRef: 'stripe-7546284' },
];
const answers: GeneratedAnswer[] = [
    {
        "fieldId": "first_name_0",
        "intent": "full_name",
        "value": "Jordan",
        "source": "profile",
        "confidence": 0.95,
        "requiresReview": false
    },
    {
        "fieldId": "last_name_1",
        "intent": "full_name",
        "value": "Smith",
        "source": "profile",
        "confidence": 0.95,
        "requiresReview": false
    },
    {
        "fieldId": "email_2",
        "intent": "email",
        "value": "jordan.smith@example.com",
        "source": "profile",
        "confidence": 1.0,
        "requiresReview": false
    },
    {
        "fieldId": "country_3",
        "intent": "address",
        "value": "United States",
        "source": "profile",
        "confidence": 0.9,
        "requiresReview": false
    },
    {
        "fieldId": "phone_4",
        "intent": "phone",
        "value": "555-012-3456",
        "source": "profile",
        "confidence": 1.0,
        "requiresReview": false
    },
    {
        "fieldId": "location_city_5",
        "intent": "address",
        "value": "San Francisco, CA",
        "source": "profile",
        "confidence": 0.85,
        "requiresReview": false
    },
    {
        "fieldId": "resume_cv_6",
        "intent": "upload_resume",
        "value": "jordan_smith_resume.pdf",
        "source": "user_manual",
        "confidence": 1.0,
        "requiresReview": false
    },
    {
        "fieldId": "cover_letter_7",
        "intent": "upload_cover_letter",
        "value": "jordan_smith_cover_letter.pdf",
        "source": "user_manual",
        "confidence": 1.0,
        "requiresReview": false
    },
    {
        "fieldId": "school_8",
        "intent": "school_name",
        "value": "University of California, Berkeley",
        "source": "profile",
        "confidence": 0.95,
        "requiresReview": false
    },
    {
        "fieldId": "degree_9",
        "intent": "degree_status",
        "value": "Bachelor's Degree",
        "source": "profile",
        "confidence": 0.9,
        "requiresReview": false
    },
    {
        "fieldId": "discipline_10",
        "intent": "major",
        "value": "Computer Science",
        "source": "profile",
        "confidence": 0.95,
        "requiresReview": false
    },
    {
        "fieldId": "start_date_month_11",
        "intent": "unknown",
        "value": "August",
        "source": "profile",
        "confidence": 0.8,
        "requiresReview": true
    },
    {
        "fieldId": "start_date_year_12",
        "intent": "unknown",
        "value": "2018",
        "source": "profile",
        "confidence": 0.8,
        "requiresReview": true
    },
    {
        "fieldId": "end_date_month_13",
        "intent": "graduation_date",
        "value": "May",
        "source": "profile",
        "confidence": 0.85,
        "requiresReview": false
    },
    {
        "fieldId": "end_date_year_14",
        "intent": "graduation_date",
        "value": "2022",
        "source": "profile",
        "confidence": 0.85,
        "requiresReview": false
    },
    {
        "fieldId": "are_you_legally_authorized_to_work_in_the_us_15",
        "intent": "work_authorization",
        "value": "Yes",
        "source": "saved_answer",
        "confidence": 1.0,
        "requiresReview": false
    },
    {
        "fieldId": "do_you_now_or_will_you_in_the_future_require_sponsorship_or_transfer_for_employment_visa_status_16",
        "intent": "visa_sponsorship",
        "value": "No",
        "source": "saved_answer",
        "confidence": 1.0,
        "requiresReview": false
    },
    {
        "fieldId": "are_you_willing_to_undergo_background_and_drug_screening_17",
        "intent": "screening_yes_no",
        "value": "Yes",
        "source": "default_rule",
        "confidence": 0.9,
        "requiresReview": false
    },
    {
        "fieldId": "are_you_at_least_18_years_of_age_or_will_be_within_the_next_2_weeks_18",
        "intent": "screening_yes_no",
        "value": "Yes",
        "source": "default_rule",
        "confidence": 1.0,
        "requiresReview": false
    },
    {
        "fieldId": "have_you_previously_worked_at_scion_19",
        "intent": "screening_yes_no",
        "value": "No",
        "source": "default_rule",
        "confidence": 1.0,
        "requiresReview": false
    },
    {
        "fieldId": "were_you_referred_by_a_current_scion_employee_20",
        "intent": "referral_source",
        "value": "No",
        "source": "user_manual",
        "confidence": 1.0,
        "requiresReview": false
    },
    {
        "fieldId": "if_yes_please_provide_their_first_and_last_name_21",
        "intent": "referral_details",
        "value": "",
        "source": "user_manual",
        "confidence": 1.0,
        "requiresReview": false
    },
    {
        "fieldId": "please_recognize_the_dropdown_below_22",
        "intent": "unknown",
        "value": "I acknowledge",
        "source": "ai_generated",
        "confidence": 0.4,
        "requiresReview": true
    },
    {
        "fieldId": "which_option_s_best_describes_you_check_all_that_apply_23",
        "intent": "eeo_gender",
        "value": ["Man"],
        "source": "profile",
        "confidence": 0.9,
        "requiresReview": false
    },
    {
        "fieldId": "what_is_your_age_24",
        "intent": "screening_open_ended",
        "value": "25-34",
        "source": "profile",
        "confidence": 0.85,
        "requiresReview": false
    },
    {
        "fieldId": "which_option_s_best_describes_your_sexual_orientation_check_all_that_apply_25",
        "intent": "unknown",
        "value": ["Heterosexual"],
        "source": "profile",
        "confidence": 0.9,
        "requiresReview": true
    },
    {
        "fieldId": "which_option_s_best_describes_your_race_ethnicity_check_all_that_apply_26",
        "intent": "eeo_race",
        "value": ["White"],
        "source": "profile",
        "confidence": 0.95,
        "requiresReview": false
    },
    {
        "fieldId": "which_option_best_describes_your_highest_degree_or_level_of_education_you_have_completed_27",
        "intent": "degree_status",
        "value": "Bachelor's degree",
        "source": "profile",
        "confidence": 0.95,
        "requiresReview": false
    },
    {
        "fieldId": "please_indicate_your_veteran_status_28",
        "intent": "eeo_veteran_status",
        "value": "I am not a protected veteran",
        "source": "saved_answer",
        "confidence": 1.0,
        "requiresReview": false
    },
    {
        "fieldId": "please_indicate_whether_you_identify_as_a_person_with_a_disability_neurodiverse_exceptionality_or_are_differently_abled_29",
        "intent": "eeo_disability",
        "value": "No, I do not have a disability",
        "source": "saved_answer",
        "confidence": 1.0,
        "requiresReview": false
    },
    {
        "fieldId": "which_option_s_best_describes_your_disability_if_applicable_30",
        "intent": "eeo_disability",
        "value": ["Not Applicable"],
        "source": "saved_answer",
        "confidence": 1.0,
        "requiresReview": false
    },
    {
        "fieldId": "please_indicate_which_option_best_describes_your_marital_status_31",
        "intent": "unknown",
        "value": "Single",
        "source": "profile",
        "confidence": 0.8,
        "requiresReview": true
    },
    {
        "fieldId": "please_indicate_which_best_describes_you_32",
        "intent": "unknown",
        "value": "Professional",
        "source": "ai_generated",
        "confidence": 0.5,
        "requiresReview": true
    },
    {
        "fieldId": "are_you_a_caretaker_for_one_or_more_family_members_33",
        "intent": "unknown",
        "value": "No",
        "source": "profile",
        "confidence": 0.85,
        "requiresReview": true
    },
    {
        "fieldId": "gender_34",
        "intent": "eeo_gender",
        "value": "Man",
        "source": "profile",
        "confidence": 1.0,
        "requiresReview": false
    },
    {
        "fieldId": "are_you_hispanic_latino_35",
        "intent": "eeo_race",
        "value": "No",
        "source": "profile",
        "confidence": 1.0,
        "requiresReview": false
    },
    {
        "fieldId": "veteran_status_36",
        "intent": "eeo_veteran_status",
        "value": "I am not a protected veteran",
        "source": "saved_answer",
        "confidence": 1.0,
        "requiresReview": false
    },
    {
        "fieldId": "disability_status_37",
        "intent": "eeo_disability",
        "value": "No, I do not have a disability",
        "source": "saved_answer",
        "confidence": 1.0,
        "requiresReview": false
    }
]
async function run() {
    const browser = await chromium.launch({ headless: false });

    for (const { label, url, jobRef } of TEST_URLS) {
        console.log(`\n${'='.repeat(40)}`);
        console.log(`${label}: ${url}`);
        console.log('='.repeat(40));

        const page = await browser.newPage();
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
            const result = await extractGreenhouseForm(page, jobRef);
            // const classifiedFields = await classifyAllFields(result.schema.fields);
            // const fillFormResults = await GreenhouseSiteFormExtractor.fillForm(page, null, classifiedFields, answers);
            // console.log({ fillFormResults });

            console.log(`\nFields extracted: ${result.schema.fields.length}`);
            console.log(`Present sections: ${result.presentSections.map(s => s.key).join(', ') || 'none'}`);
            console.log('\nField summary:');
            for (const f of result.schema.fields) {
                console.log(`  [${f.fieldType}] ${f.rawLabel} ${f.required ? '(required)' : ''} → ${f.selectors.inputSelector}`);
            }
        } catch (err) {
            console.error(`Failed for ${label}:`, err);
        } finally {
            // await page.close();
        }
    }

    await browser.close();
}

run().catch(console.error);