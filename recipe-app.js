if (Meteor.isClient) {
  Meteor.startup(function () {
    Session.setDefault("currentInstruction", 1); // indexed by 1
    Session.setDefault("recipe", null);

    if (annyang) {
      var commands = {
        '*command': function(command) {
          Meteor.call("getWitAccessToken", function(tokenError, accessToken) {
            console.log(tokenError);
            if (!tokenError) {
              var parameters = {"q": command,
                                "access_token": accessToken};
              HTTP.get('https://api.wit.ai/message',
                       {params: parameters},
                       function (error, result) {
                         console.log(error);
                         if (!error) {
                          handleWitResponse(EJSON.parse(result.content));
                         }
                       });
            }
          });
        }
      };

      annyang.addCommands(commands);

      annyang.start();
    }
  });

  function handleWitResponse(json) {
    console.debug("Handling wit response: ", json);

    for (var i = 0; i < json.outcomes.length; i++) {
      var outcome = json.outcomes[i];
      var confidence = outcome.confidence;
      var intent = outcome.intent;
      var entities = [];
      for (entityName in outcome.entities) {
        var entityArray = outcome.entities[entityName];
        for (var k = 0; k < entityArray.length; k++) {
          entities.push(entityName + "," + entityArray[k].value);
        }
      }
      console.debug("Wit response (confidence: %f, intent: %s, entities: %s",
                    confidence, intent, entities.join(","));
    }

    for (outcome_index in json.outcomes) {
      var outcome = json.outcomes[outcome_index];
      console.debug("Outcome: ", EJSON.stringify(outcome));
      if (outcome.confidence >= 0.8) {
        switch (outcome.intent) {
          case "ingredient_query":
            if (outcome.entities.ingredient.length > 0) {
              var ingredient = outcome.entities.ingredient[0].value;
              console.debug("ingredient_query: ", ingredient);
              selectIngredient(ingredient);
            } else {
              console.debug("No valid ingredients!");
            }
          break;
          case "instruction_navigation":
            if (outcome.entities.instruction.length > 0) {
              var instruction = outcome.entities.instruction[0].value;
              console.debug("instruction_navigation: ", instruction);
              selectInstruction(instruction);
            } else {
              console.debug("No valid ingredients!");
            }
          break;
          default:
            console.debug("Unknown intent with high confidence");
          break;
        }
        // TODO(ebensh): Add this back if we're only getting one intent?
        //break;
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

  function selectIngredient(ingredient) {
    // Finds ingredient in the list of ingredients and selects it, setting
    // currentIngredient to its index.
    clearSelectedIngredients();
    var recipe = Session.get("recipe");
    for (var i = 0; i < recipe.extendedIngredients.length; i++) {
      if (recipe.extendedIngredients[i].name.indexOf(ingredient) != -1) {
        console.debug("Selected ingredient: ", recipe.extendedIngredients[i].originalString);
        recipe.extendedIngredients[i].highlight = true;
        speak(recipe.extendedIngredients[i].originalString);
      }
    }
    Session.set("recipe", recipe);
  }

  function selectInstruction(instruction) {
    // TODO(ebensh): #YOLO420SWAG4JEZUS do this :)
    console.debug("OMG WE DIDN'T DO THIS YET TROLOLOLOLOLO");
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
    instructions: function() {
      var bigInstructionText = Session.get("recipe").text;
      return bigInstructionText.split(/\.\s/);
    }
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
