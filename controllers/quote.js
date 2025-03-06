const {
  responseFormatter,
  statusCodes,
  generateId,
  modifyAge,
  quoteUtils,
  azureBlob,
} = require("../utils");
const { event, quote, lead } = require("../db");
const { generateUniqueString } = require("../utils/generateId");
const axios = require("axios");
const https = require("https");
require("dotenv").config();
const moment = require("moment/moment");

exports.getMetaData = async (request, reply) => {
  try {
    const { metaMasters } = request.body;
    let addOnRider;
    if (metaMasters.includes("7b7bb29b0c94475b8949770af6bcac52")) {
      addOnRider = await quote.getAddOnRider();
    }
    const metaData = await quote.getMetaData(metaMasters); // Getting meta data from DB & mapping keys

    if (metaData.length > 0) {
      await event.insertEventTransaction(request.isValid);
      const groupedData = metaData.reduce((acc, item) => {
        if (!acc[item.meta_master_name]) {
          acc[item.meta_master_name] = [];
        }

        // Check if meta_master_name is 'Payment_type_product_recommendation' or 'Investment_horizon'
        if (item.meta_master_name === "Payment_type_product_recommendation") {
          // Add 'selected' field based on meta_data_name value
          if (item.meta_data_name === "Single") {
            item.selected = true;
          } else {
            item.selected = false;
          }
        } else if (item.meta_master_name === "Investment_horizon") {
          // Add 'selected' field based on meta_data_name value
          if (item.meta_data_name === "Short term") {
            item.selected = true;
          } else {
            item.selected = false;
          }
        }

        // Push the item to the grouped data
        acc[item.meta_master_name].push(item);
        return acc;
      }, {});

      groupedData["Add_On_Riders"] = addOnRider;
      return reply
        .status(statusCodes.OK)
        .send(
          responseFormatter(
            statusCodes.OK,
            "Meta Data retrieved successfully",
            groupedData
          )
        );
    } else {
      return reply
        .status(statusCodes.NO_CONTENT)
        .send(responseFormatter(statusCodes.NO_CONTENT, "Data not found"));
    }
  } catch (error) {
    return reply
      .status(statusCodes.INTERNAL_SERVER_ERROR)
      .send(
        responseFormatter(
          statusCodes.INTERNAL_SERVER_ERROR,
          "Internal server error occurred",
          { error: error.message }
        )
      );
  }
};

exports.getLeadInfo = async (request, reply) => {
  try {
    const { idlead } = request.body;
    const identity = request.isValid.identity;
    const leadInfo = await lead.getLeadInfo(idlead, identity);
    if (leadInfo.length) {
      await event.insertEventTransaction(request.isValid);
      return reply
        .status(statusCodes.OK)
        .send(
          responseFormatter(
            statusCodes.OK,
            "Fetched Lead Info Successfully",
            leadInfo[0]
          )
        );
    } else {
      return reply
        .status(statusCodes.OK)
        .send(responseFormatter(statusCodes.OK, "Lead Info Not Found"));
    }
  } catch (error) {
    return reply
      .status(statusCodes.INTERNAL_SERVER_ERROR)
      .send(
        responseFormatter(
          statusCodes.INTERNAL_SERVER_ERROR,
          "Internal server error occurred",
          { error: error.message }
        )
      );
  }
};

exports.createQuote = async (request, reply) => {
  try {
    const reqBody = {
      quote_identity: generateId.generateUniqueString(),
      quick_quote_id: generateId.generateQuickQuiteId(),
      dob: moment(request.body.dob, "DD/MM/YYYY").format("YYYY/MM/DD"),
      product_name: request.body.product_name,
      leadid: request.body.leadid,
      nationality: request.body.nationality,
      residential_status: request.body.residential_status,
      smoker: request.body.smoker,
      occupation: request.body.occupation,
      educational_background: request.body.educational_background,
      annual_income: request.body.annual_income,
      coverage_amount: request.body.coverage_amount,
      cover_till_age: request.body.cover_till_age,
      premium_payment_term: request.body.premium_payment_term,
      payment_type: request.body.payment_type,
      base_premium: request.body.base_premium,
      add_on_rider_amt: request.body.add_on_rider_amt,
      total_premium: request.body.total_premium,
    };

    const entityIdentity = await quote.getEntityIdentity(reqBody.leadid);
    await quote.updateEntityDobByIdentity(entityIdentity, reqBody.dob);
    const quoteRes = await quote.createQuote(reqBody);
    if (quoteRes.length) {
      await event.insertEventTransaction(request.isValid);
      return reply.status(statusCodes.OK).send(
        responseFormatter(statusCodes.OK, "Quote created successfully", {
          quick_quote_id: quoteRes[0].quick_quote_id,
        })
      );
    } else {
      return reply
        .status(statusCodes.OK)
        .send(responseFormatter(statusCodes.OK, "Quote did not created"));
    }
  } catch (error) {
    return reply
      .status(statusCodes.INTERNAL_SERVER_ERROR)
      .send(
        responseFormatter(
          statusCodes.INTERNAL_SERVER_ERROR,
          "Internal server error occurred",
          { error: error.message }
        )
      );
  }
};

exports.getAddOnPremium = async (request, reply) => {
  try {
    // Retrieve Add-On Riders and Meta Data
    const addOnRider = await quote.getAddOnRider();
    const metaData = await quote.getMetaData([
      "f600b9faf4934b25af40d33c938c30b7",
    ]);

    // Group the meta data by 'meta_master_name'
    const groupedData = metaData.reduce((acc, item) => {
      if (!acc[item.meta_master_name]) {
        acc[item.meta_master_name] = [];
      }
      acc[item.meta_master_name].push(item);
      return acc;
    }, {});

    // Extract premium-related request data
    const premiumRequest = request.body;
    const quoteArray = [
      premiumRequest.smoker,
      premiumRequest.premium_payment_term,
      premiumRequest.policy_term,
      premiumRequest.payment_type,
    ];
    const premiumRawData = await quote.getPremiumRawData(quoteArray);
    // Calculate gender
    const gender = request.body.gender ? request.body.gender.toLowerCase() : "";
    let result;
    if (gender === "male") {
      result = "M";
    } else if (gender === "female") {
      result = "F";
    } else {
      result = "T";
    }
    const dob = request.body.dob; // "17/11/1999"
    const [day, month, year] = dob.split("/"); // Destructure the day, month, and year

    // Create a valid Date object
    const birthDate = new Date(year, month - 1, day); // month is zero-indexed

    // Calculate age
    const age = new Date().getFullYear() - birthDate.getFullYear();
    const ageAtDate =
      new Date().getMonth() < birthDate.getMonth() ||
      (new Date().getMonth() === birthDate.getMonth() &&
        new Date().getDate() < birthDate.getDate())
        ? age - 1
        : age;

    // Function to convert coverage amounts to numeric values
    const convertToNumeric = (coverageString) => {
      if (coverageString.includes("Cr")) {
        return parseInt(coverageString.replace(" Cr", "")) * 10000000; // 1 Cr = 10 million
      } else if (coverageString.includes("Lakhs")) {
        return parseInt(coverageString.replace(" Lakhs", "")) * 100000; // 1 Lakh = 100 thousand
      }
      return 0;
    };

    // Prepare data for the axios POST request
    const data = addOnRider.map((item) => {
      return {
        age: ageAtDate,
        ppt: premiumRawData.Premium_Payment_Term,
        gender: result,
        product_term: premiumRawData.Policy_Term,
        tobacco: premiumRawData.Smoker,
        product_Name: item.product_name.replace(/\s+/g, "_"), // Replace spaces with underscores
      };
    });

    const url = process.env.PREMIUM_URL;
    const agent = new https.Agent({
      rejectUnauthorized: false, // Disable SSL certificate verification
    });

    // Get premium rates from the external API
    const premiumRate = await axios.post(url, data, { httpsAgent: agent });
    let premium = premiumRate.data.results;

    // Check if the premium is null and filter them out
    premium = premium.filter((item) => item.premium !== null);
    // Map through each addOnRider and add the coverage amount and premium details
    // Map through each addOnRider and add the coverage amount and premium details
    const resultData = addOnRider
      .map((item) => {
        // Extract the coverage amounts and filter out the ones with premium 0
        const coverageAmounts = groupedData.Coverage_Amount.map((coverage) => {
          const amountNumeric = convertToNumeric(coverage.meta_data_name);
          // Get the corresponding premium rate for each coverage amount
          const premiumData = premium.find(
            (premiumItem) =>
              premiumItem.product_Name.replace(/\s+/g, "_") ===
              item.product_name.replace(/\s+/g, "_")
          );

          // If premium is found, calculate the premium
          let calculatedPremium = 0;
          if (premiumData) {
            const premiumAmount = premiumData.premium;
            const premiumYearly = (premiumAmount / 1000) * amountNumeric;
            // Calculate the premium (adjusted for payment type)
            switch (premiumRawData.Payment_Type.toLowerCase()) {
              case "monthly":
                calculatedPremium = premiumYearly / 12;
                break;
              case "quarterly":
                calculatedPremium = premiumYearly / 4;
                break;
              case "half-yearly":
                calculatedPremium = premiumYearly / 2;
                break;
              case "annual":
                calculatedPremium = premiumYearly; // Annual premium is the yearly premium
                break;
              default:
                return reply.status(400).send({
                  error:
                    "Invalid payment frequency. Please specify 'Monthly', 'Quarterly', 'Half-Yearly', or 'Annual'.",
                });
            }
          }

          // Return the coverage amount and calculated premium only if premium is > 0
          if (calculatedPremium > 0) {
            return {
              amount: coverage.meta_data_name, // e.g., "50 Lakhs"
              text: `@ ₹${calculatedPremium.toFixed(2)} / ${
                premiumRawData.Payment_Type
              }`, // Example text with calculated premium
              premium: Number(calculatedPremium.toFixed(2)), // The calculated premium value
            };
          }

          // If premium is 0, return nothing for this coverage amount
          return null;
        }).filter((item) => item !== null); // Filter out any null values (where premium was 0)

        // Return the complete response object for each addOnRider
        return {
          idproduct: item.idproduct,
          product_name: item.product_name,
          product_description: item.product_description,
          coverage_amount: coverageAmounts, // Only include coverage amounts with premium > 0
        };
      })
      .filter((item) => item.coverage_amount.length > 0); // Filter out items with empty coverage_amount arrays
    await event.insertEventTransaction(request.isValid);
    // Construct the final response
    return reply
      .status(statusCodes.OK)
      .send(
        responseFormatter(
          statusCodes.OK,
          "Calculated Premium For AddOns",
          resultData
        )
      );
  } catch (error) {
    // Log only the necessary parts of the error object
    console.error("Error occurred while calculating premium: ", error);

    // Return an error response
    return reply.status(statusCodes.INTERNAL_SERVER_ERROR).send(
      responseFormatter(
        statusCodes.INTERNAL_SERVER_ERROR,
        "Internal server error occurred",
        { error: error.message } // Only pass error.message, not the whole error object
      )
    );
  }
};

exports.calculatePremium = async (request, reply) => {
  try {
    const premiumRequest = request.body;
    const quoteArray = [
      premiumRequest.smoker,
      premiumRequest.premium_payment_term,
      premiumRequest.policy_term,
      premiumRequest.payment_type,
      premiumRequest.coverage_amount,
    ];
    const premiumRawData = await quote.getPremiumRawData(quoteArray);
    const productName = await quote.getProductName(premiumRequest.idproduct);
    // Calculate gender
    const gender = request.body.gender ? request.body.gender.toLowerCase() : "";
    let result;
    if (gender === "male") {
      result = "M";
    } else if (gender === "female") {
      result = "F";
    } else {
      result = "T";
    }

    // Calculate age
    const dob = request.body.dob; // "17/11/1999"
    const [day, month, year] = dob.split("/"); // Destructure the day, month, and year

    // Create a valid Date object
    const birthDate = new Date(year, month - 1, day); // month is zero-indexed

    // Calculate age
    const age = new Date().getFullYear() - birthDate.getFullYear();
    const ageAtDate =
      new Date().getMonth() < birthDate.getMonth() ||
      (new Date().getMonth() === birthDate.getMonth() &&
        new Date().getDate() < birthDate.getDate())
        ? age - 1
        : age;

    const urlData = [
      {
        age: ageAtDate,
        ppt: premiumRawData.Premium_Payment_Term,
        gender: result,
        product_term: premiumRawData.Policy_Term,
        tobacco: premiumRawData.Smoker,
        product_Name: productName.product_name.replace(/\s+/g, "_"), // Replace spaces with underscores
      },
    ];
    const url = process.env.PREMIUM_URL;
    const agent = new https.Agent({
      rejectUnauthorized: false, // Disable SSL certificate verification
    });

    // Get premium rates from the external API
    const premiumRate = await axios.post(url, urlData, { httpsAgent: agent });
    let premium = premiumRate.data.results;
    premium = premium[0].premium;
    const premiumYearly = (premium / 1000) * premiumRawData.Coverage_Amount;
    // Calculate the premium (adjusted for payment type)
    switch (premiumRawData.Payment_Type.toLowerCase()) {
      case "monthly":
        calculatedPremium = premiumYearly / 12;
        break;
      case "quarterly":
        calculatedPremium = premiumYearly / 4;
        break;
      case "half-yearly":
        calculatedPremium = premiumYearly / 2;
        break;
      case "annual":
        calculatedPremium = premiumYearly; // Annual premium is the yearly premium
        break;
      default:
        return reply.status(400).send({
          error:
            "Invalid payment frequency. Please specify 'Monthly', 'Quarterly', 'Half-Yearly', or 'Annual'.",
        });
    }
    await event.insertEventTransaction(request.isValid);
    return reply.status(statusCodes.OK).send(
      responseFormatter(statusCodes.OK, "Calculated Premium", {
        text: `@ ₹${calculatedPremium.toFixed(2)} / ${
          premiumRawData.Payment_Type
        }`, // Example text with calculated premium
        premium: Number(calculatedPremium.toFixed(2)),
      })
    );
  } catch (error) {
    return reply.status(statusCodes.INTERNAL_SERVER_ERROR).send(
      responseFormatter(
        statusCodes.INTERNAL_SERVER_ERROR,
        "Internal server error occurred",
        { error: error.message } // Only pass error.message, not the whole error object
      )
    );
  }
};

exports.productRecommendation = async (request, reply) => {
  try {
    const premiumRequest = request.body;
    const quoteArray = [
      premiumRequest.Investment_objective,
      premiumRequest.Annual_Income,
      premiumRequest.Current_life_stage,
      premiumRequest.Risk_reward_ratio,
      premiumRequest.Payment_type,
      premiumRequest.Investment_horizon,
    ];
    const premiumRawData = await quote.getPremiumRawData(quoteArray);
    const dob = request.body.Age; // "17/11/1999"
    const [day, month, year] = dob.split("/"); // Destructure the day, month, and year

    // Create a valid Date object
    const birthDate = new Date(year, month - 1, day); // month is zero-indexed

    // Calculate age
    const age = new Date().getFullYear() - birthDate.getFullYear();
    const ageAtDate =
      new Date().getMonth() < birthDate.getMonth() ||
      (new Date().getMonth() === birthDate.getMonth() &&
        new Date().getDate() < birthDate.getDate())
        ? age - 1
        : age;
    premiumRawData["Age"] = ageAtDate;
    premiumRawData["Payment_type"] =
      premiumRawData["Payment_type_product_recommendation"];
    delete premiumRawData["Payment_type_product_recommendation"];
    const agent = new https.Agent({
      rejectUnauthorized: false,
    });
    const url = process.env.GETRULEURL;
    premiumRawData["collectionName"] = "productRecommendationNvestNew";
    const response = await axios.get(url, {
      params: premiumRawData,
      httpsAgent: agent,
    });
    const productIds = response.data.then.Product;
    const productDetailsPromises = productIds.map(async (productId) => {
      let product = await modifyAge.getProductDetails(productId); // Implement this function to fetch product name
      let productName = product.productName.trim();
      const productDetails = await quote.getProductDetails(productName);
      productDetails[0][
        "premium_starts"
      ] = `@ ₹${productDetails[0].premium_starts_at} / Monthly`;
      productDetails[0]["planType"] = product.planType;
      productDetails[0]["productID"] = productId;
      return productDetails;
    });
    const productDetailsArray = await Promise.all(productDetailsPromises);
    const flattenedProductDetails = productDetailsArray.flat();
    flattenedProductDetails.push({ // Adding for Demo purpose
        "idproduct": "69ddf27fb3154bc0ae98393525a6e6c1",
        "product_name": "iSecure Plan",
        "product_description": "Life’s journey made comfortable",
        "premium_starts_at": 700,
        "premium_starts": "@ ₹700 / Monthly",
        "planType": "Term Plan",
        "productID": 1016
    })
    await event.insertEventTransaction(request.isValid);
    return reply
      .status(statusCodes.OK)
      .send(
        responseFormatter(
          statusCodes.OK,
          "Recommended Products",
          flattenedProductDetails
        )
      );
    // const modifiedData = await modifyAge(premiumRawData);

    // const headers = {
    //   "x-tenant-name": "actuarial",
    //   "x-synthetic-key": process.env.SYNTHETIC_KEY,
    //   "Content-Type": "application/json",
    // };
    // const data = {
    //   request_data: {
    //     inputs: {
    //       Investment_objective: modifiedData.Investment_objective,
    //       Annual_Income: modifiedData.Annual_Income,
    //       Current_life_stage: modifiedData.Current_life_stage,
    //       Risk_reward_ratio: modifiedData.Risk_reward_ratio,
    //       Payment_type: modifiedData.Payment_type_product_recommendation,
    //       Investment_horizon: modifiedData.Investment_horizon,
    //       Age: modifiedData.Age,
    //     },
    //   },
    //   request_meta: {
    //     call_purpose: "EY India Demo - Integration",
    //     source_system: "Curl Demo",
    //     correlation_id: "my-test-id",
    //   },
    // };
    // const response = await axios.post(url, data, {
    //   httpsAgent: agent,
    //   headers: headers,
    // });

    // let productName = response.data.response_data.outputs.Product;
    // productName = productName.trim();
    // const productDetails = await quote.getProductDetails(productName);
    // productDetails.forEach((product) => {
    //   product.premium_starts_at = `@ ₹${product.premium_starts_at} / Monthly`;
    // });
  } catch (error) {
    // Log only the necessary parts of the error object
    console.error("Error occurred while calculating premium: ", error);
    // Return an error response
    return reply.status(statusCodes.INTERNAL_SERVER_ERROR).send(
      responseFormatter(
        statusCodes.INTERNAL_SERVER_ERROR,
        "Internal server error occurred",
        { error: error.message } // Only pass error.message, not the whole error object
      )
    );
  }
};

exports.calculatePremiumForRecommendedProduct = async (request, reply) => {
  try {
    const premiumRequest = request.body;
    const quoteArray = [
      premiumRequest.smoker,
      premiumRequest.premium_payment_term,
      premiumRequest.policy_term,
      premiumRequest.payment_type,
    ];
    const premiumRawData = await quote.getPremiumRawData(quoteArray);
    let smokerValue =
      premiumRawData.Smoker === "N"
        ? "NS"
        : premiumRawData.Smoker === "Y"
        ? "S"
        : premiumRawData.Smoker;
    const dob = request.body.Age;
    const [day, month, year] = dob.split("/");
    const birthDate = new Date(year, month - 1, day);
    const age = new Date().getFullYear() - birthDate.getFullYear();
    const ageAtDate =
      new Date().getMonth() < birthDate.getMonth() ||
      (new Date().getMonth() === birthDate.getMonth() &&
        new Date().getDate() < birthDate.getDate())
        ? age - 1
        : age;

    const gender = request.body.gender ? request.body.gender.toLowerCase() : "";
    let result;
    if (gender === "male") {
      result = "M";
    } else if (gender === "female") {
      result = "F";
    } else {
      result = "T";
    }
    const data = {
      request_data: {
        inputs: {
          Age: ageAtDate,
          AnnDivSwitch: "Y", // hardcoded
          CalBy: "Sum Assured", // hardcoded
          Currency: "SGD", //hardcoded
          DBOption: 1, //hardcoded
          DBPercentage: 1.1, //hardcoded
          Gender: result,
          InterestRate: 0.06, //hardcoded
          MaturityAge: ageAtDate + premiumRawData.Policy_Term, // age + policy_term
          PremFrequency: 4,
          PremTerm: premiumRawData.PPT_RECOMMENDED_PRODUCT,
          Smoking: smokerValue,
          SumAssured: premiumRequest.sumAssured,
          TargetPremium: 3022, // hardcoded
          TermBonusSwitch: "Y", // hardcoded
          BI: {
            FileName: "",
            ReportName: "BI",
          },
        },
      },
      request_meta: {
        call_purpose: "EY India Demo - Integration",
        source_system: "Curl Demo",
        correlation_id: "my-test-id",
      },
    };
    const agent = new https.Agent({
      rejectUnauthorized: false, // Disable SSL certificate verification
    });
    const headers = {
      "x-tenant-name": "actuarial",
      "x-synthetic-key": process.env.SYNTHETIC_KEY,
      "Content-Type": "application/json",
    };
    const url = process.env.PRODUCTPREMIUMCALCULATION;
    // const response = await axios.post(url, config);
    const response = await axios.post(url, data, {
      httpsAgent: agent,
      headers: headers,
    });
    const premium = response.data.response_data.outputs.DB;
    await event.insertEventTransaction(request.isValid);
    return reply.status(statusCodes.OK).send(
      responseFormatter(
        statusCodes.OK,
        "Calculated Premiun For Recommended Product",
        {
          text: `@ ₹${premium.toFixed(2)} / ${premiumRawData.Payment_Type}`, // Example text with calculated premium
          premium: Number(premium.toFixed(2)),
        }
      )
    );
  } catch (error) {
    console.error("Error occurred while calculating premium: ", error);
    // Return an error response
    return reply.status(statusCodes.INTERNAL_SERVER_ERROR).send(
      responseFormatter(
        statusCodes.INTERNAL_SERVER_ERROR,
        "Internal server error occurred",
        { error: error.message } // Only pass error.message, not the whole error object
      )
    );
  }
};

exports.getQuoteCount = async (request, reply) => {
  try {
    const quoteCount = await quote.quoteCount();
    return reply
      .status(statusCodes.OK)
      .send(responseFormatter(statusCodes.OK, "Quote Count", quoteCount[0]));
  } catch (error) {
    console.error("Error occurred while calculating premium: ", error);
    // Return an error response
    return reply.status(statusCodes.INTERNAL_SERVER_ERROR).send(
      responseFormatter(
        statusCodes.INTERNAL_SERVER_ERROR,
        "Internal server error occurred",
        { error: error.message } // Only pass error.message, not the whole error object
      )
    );
  }
};

exports.createQuoteNvest = async (request, reply) => {
  try {
    const quick_quote = await quoteUtils.createQuote(request.body);
    await event.insertEventTransaction(request.isValid);
    return reply.status(statusCodes.OK).send(
      responseFormatter(statusCodes.OK, "Quote created successfully", {
        quote: quick_quote,
      })
    );
  } catch (error) {
    return reply
      .status(statusCodes.INTERNAL_SERVER_ERROR)
      .send(
        responseFormatter(
          statusCodes.INTERNAL_SERVER_ERROR,
          "Internal server error occurred",
          { error: error.message }
        )
      );
  }
};

exports.getQuote = async (request, reply) => {
  try {
    const quote = await quoteUtils.getQuote(request.body);
    const buffer = Buffer.from(quote.pdfData, "base64");
    const quotePdf = await azureBlob.uploadFileToBlob(
      request.body.QuotationNo,
      buffer
    );
    quote["quotePdf"] = quotePdf;
    if (quote) {
      await event.insertEventTransaction(request.isValid);
      return reply.status(statusCodes.OK).send(
        responseFormatter(statusCodes.OK, "Quote fetched successfully", {
          quote,
        })
      );
    } else {
      return reply
        .status(statusCodes.OK)
        .send(responseFormatter(statusCodes.OK, "Quote not found", {}));
    }
  } catch (error) {
    console.log(error);
    return reply
      .status(statusCodes.INTERNAL_SERVER_ERROR)
      .send(
        responseFormatter(
          statusCodes.INTERNAL_SERVER_ERROR,
          "Internal server error occurred",
          { error: error.message }
        )
      );
  }
};

exports.getFields = async (request, reply) => {
  try {
    const fields = await quoteUtils.getFields(request.body);
    if (fields) {
      await event.insertEventTransaction(request.isValid);
      return reply.status(statusCodes.OK).send(
        responseFormatter(statusCodes.OK, "Fields fetched successfully", {
          fields,
        })
      );
    } else {
      return reply
        .status(statusCodes.OK)
        .send(responseFormatter(statusCodes.OK, "fields not found", {}));
    }
  } catch (error) {
    return reply
      .status(statusCodes.INTERNAL_SERVER_ERROR)
      .send(
        responseFormatter(
          statusCodes.INTERNAL_SERVER_ERROR,
          "Internal server error occurred",
          { error: error.message }
        )
      );
  }
};
