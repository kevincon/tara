if (Meteor.isClient) {
  Meteor.startup(function () {
    Session.setDefault("currentInstruction", 1); // indexed by 1
    Session.setDefault("recipe", null);

    Session.setDefault("isListening", false);

    GAnalytics.pageview();
  });

  function startAnnyang() {
    if (annyang) {
      var commands = {
        'hey *name': function(name) {
          if (!Session.get("isListening")) {
            speak("Yes?");
            Session.set("isListening", true);
          }
        },
        '*command': function(command) {
          if (Session.get("isListening")) {
            Meteor.call("getWitAccessToken", function(tokenError, accessToken) {
              console.log(tokenError);
              if (!tokenError) {
                var parameters = {"q": command,
                                  "access_token": accessToken};
                $.ajax({
                  url: 'https://api.wit.ai/message',
                  data: parameters,
                  dataType: 'jsonp',
                  method: 'GET',
                  success: function(response) {
                      console.log(response);
                      handleWitResponse(response);
                      Session.set("isListening", false);
                  }
                });
              }
            });
          } else {
            console.log("heard " + command + " while not listening...");
          }
        }
      };

      annyang.addCommands(commands);

      annyang.start();
    }
  }

  function handleWitResponse(json) {
    console.debug("Handling wit response: ", json);

    for (var i = 0; i < json.outcomes.length; i++) {
      var outcome = json.outcomes[i];
      var confidence = outcome.confidence;
      var intent = outcome.intent;  // eg. ingredient_query
      var entityType = "";
      var entityValue = "";

      for (entityName in outcome.entities) {  // eg. Ingredient
        var entityValueWrappers = outcome.entities[entityName];  // eg. [egg, flour] (usually just 1)
        var entityValues = [];
        for (var k = 0; k < entityValueWrappers.length; k++) {
          entityValues.push(entityValueWrappers[k].value);
        }

        if (entityType == "" && entityValue == "" && entityValues.length > 0) {
          entityType = entityName;
          entityValue = entityValues[0];
        }
        console.debug("Wit response (confidence: %f, intent: %s, entityType: %s, entityValue: %s",
                      confidence, intent, entityType, entityValue);
      }

      if (entityType == "" && entityValue == "") {
        console.log("No entities found.");
        speak("Sorry, can you repeat that?");
        return;
      }

      switch (intent) {
        case "ingredient_query":
          selectIngredient(entityType, entityValue);
          break;
        case "instruction_navigation":
          selectInstruction(entityType, entityValue);
          break;
        default:
          console.debug("Unknown intent with high confidence");
          break;
      }
    }
  }

  function clearSelectedIngredients() {
    var recipe = Session.get("recipe");
    for (var i = 0; i < recipe.extendedIngredients.length; i++) {
      recipe.extendedIngredients[i].highlight = false;
    }
    Session.set("recipe", recipe);
  }

  function selectIngredient(unusedType, ingredient) {
    // Finds ingredient in the list of ingredients and selects it, setting
    // currentIngredient to its index.
    clearSelectedIngredients();
    var recipe = Session.get("recipe");
    var foundIngredient = false;
    for (var i = 0; i < recipe.extendedIngredients.length; i++) {
      if (recipe.extendedIngredients[i].name.indexOf(ingredient) != -1) {
        console.debug("Selected ingredient: ", recipe.extendedIngredients[i].originalString);
        recipe.extendedIngredients[i].highlight = true;
        speak(recipe.extendedIngredients[i].originalString);
        foundIngredient = true;
      }
    }

    if (!foundIngredient) {
      speak("Sorry, I didn't see " + ingredient + " in this recipe.");
    } else {
      Session.set("recipe", recipe);
    }
  }

  function selectInstruction(type, instruction) {
    // TODO(ebensh): #YOLO420SWAG4JEZUS do this :)
    // Wit response (confidence: 0.999, intent: instruction_navigation, entity: ordinal, entityValue: 1
    // Wit response (confidence: 0.991, intent: instruction_navigation, entity: relative_instruction_navigation, entityValue: next

    var newInstruction = 0;
    var currentInstruction = Session.get("currentInstruction");

    if (type == "ordinal" || type == "number") { newInstruction = instruction; }
    else if (type == "relative_instruction_navigation") {
      switch (instruction) {
        case "previous": newInstruction = currentInstruction - 1; break;
        case "current": newInstruction = currentInstruction; break;
        case "next": newInstruction = currentInstruction + 1; break;
      }
    } else {
      console.error("Unknown instruction type");
    }

    selectAndSayInstruction(newInstruction);
  }

  function getInstructions() {
    var bigInstructionText = Session.get("recipe").text;
    return bigInstructionText.split(/\.\s/);
  }

  function selectAndSayInstruction(instruction) {
    console.debug("Selecting and saying instruction: ", instruction);
    var instructions = getInstructions();
    if (instruction >= 1 && instruction <= instructions.length) {
      Session.set("currentInstruction", instruction);
      speak(instructions[instruction - 1]);
    } else {
      speak("Invalid instruction.");
    }
  }

  /*
  // For debug only:
  Meteor.call("getTestRecipe", function(error, result) {
    Session.set("recipe", result);
  });
  */

  Template.body.helpers({
    recipeExists: function() {
      return Session.get("recipe") !== null;
    }
  });

  Template.body.events = {
    'click .favorite': function(event, template) {
      var url = template.find(".recipeurl").value;
      loadRecipeUrl("http://allrecipes.com/recipe/best-mac-n-cheese-ever/");
    }
  };

  function loadRecipeUrl(url) {
    if (!url || url.length === 0) {
      console.log("bad recipe url");
      return;
    }

    console.debug("Loading new recipe from URL: " + url);
    Meteor.call("getRecipe", url, function(error, result) {
      if (result === undefined || result === null) {
        console.debug("Result is bad :(");
      } else {
        console.debug("Result is good :)");
        console.debug("Stringified recipe: " + EJSON.stringify(result));
        Session.set("recipe", result);
        startAnnyang();
      }
    });
  }

  Template.recipeurl.events = {
    // If the enter key is pressed in the recipe URL input box, load the url.
    'keypress .recipeurl': function (event, template) {
      if (event.which === 13) {  // Enter key pressed
        console.log("enter pressed");
        var url = template.find(".recipeurl").value;
        console.log("url" + url);
        loadRecipeUrl(url);
      }
    }
  };

  Template.title.helpers({
    title: function() {
      return Session.get("recipe").title;
    },
    image: function() {
      var recipe = Session.get("recipe");
      if (recipe) {
        var imageUrls = recipe.imageUrls;
        if (imageUrls.length > 0) {
          var url = imageUrls[0];
          if (url.indexOf("http") != -1) {
            return {"key": 0, "value": imageUrls[0]};
          } else {
            return {"key": 0, "value": null};
          }
        } else {
          // TODO return placeholder image instead of null
          return {"key": 0, "value": null};
        }
      } else {
        return {"key": 0, "value": null};
      }
    }
  });

  Template.ingredients.helpers({
    ingredients: function() {
      return Session.get("recipe").extendedIngredients;
    }
  });

  Template.ingredient.events({
    "click tr": function() {
      speak(this.originalString);
    }
  });

  Template.registerHelper("arrayify", function(theArray, offset) {
    resultingArray = [];
    for (var i = 0; i < theArray.length; i++) {
      resultingArray.push({"key": i + offset, "value": theArray[i]});
    }
    return resultingArray;
  });

  Template.instructions.helpers({
    instructions: getInstructions
  });

  Template.instruction.helpers({
    isCurrentInstruction: function(key) {
      return key == Session.get("currentInstruction");
    }
  });

  Template.instruction.events({
    "click tr": function() {
      Session.set("currentInstruction", this.key);
      speak(this.value);
    }
  });

  function speak(text) {
    Meteor.call("getSpeechURL", text, function(error, result) {
      var speech = new buzz.sound(result);
      if (speech) {
        for (var i in buzz.sounds) { buzz.sounds[i].stop(); }
        speech.play();
      }
    });
  }
}

if (Meteor.isServer) {
  Meteor.methods({
    getTestRecipe: function() {
      return EJSON.parse(Assets.getText("recipe.json"));
    },
    getRecipe: function(recipeUrl) {
      //? this.unblock
      var endpoint = "https://webknox-recipes.p.mashape.com/recipes/extract";
      var params = {"url": recipeUrl};
      var headers = {"X-Mashape-Key": Meteor.settings.WEBKNOX_API_KEY,
                     "Accept": "application/json"};

      try {
        var result = Meteor.http.call("GET", endpoint, {params: params, headers: headers});
        return EJSON.parse(result.content);
      } catch (e) {
        console.log("Cannot get recipe from URL", e);
        return null;
      }
    },
    getSpeechURL: function(text) {
      var options = {"apikey": Meteor.settings.ISPEECH_API_KEY,
                     "action": "convert",
                     "voice": "ukenglishfemale",
                     "text": text};

      var speechURL = "https://api.ispeech.org/api/rest?";
      for (option in options) {
        speechURL += option + "=" + options[option] + "&";
      }
      return speechURL;
    },
    getWitAccessToken: function() {
      return Meteor.settings.WIT_ACCESS_TOKEN;
    }
  });
}
